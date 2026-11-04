"""Generate the two prototype planet textures procedurally (original work, no third-party licence).

    python3 assets/tools/gen-planets.py

Writes equirectangular (2:1) maps to public/assets/textures/planets/:
  megacity_albedo.jpg    city-covered planet: grey districts, street grid, a few dark reservoirs
  megacity_emissive.jpg  night lights along streets and in dense districts (use as emissive texture)
  ocean_albedo.jpg       water world: deep and shallow water, a handful of small islands
  ocean_specular.jpg     white = water (shiny), black = land (use as specular / inverted roughness)

The noise is sampled on the unit sphere, so the maps wrap seamlessly at the date line and have no polar pinch.
Needs numpy and Pillow.
"""
import os

import numpy as np
from PIL import Image

W, H = 2048, 1024
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "assets", "textures", "planets")


def sphere_coords(w, h):
    lon = (np.arange(w) + 0.5) / w * 2 * np.pi - np.pi
    lat = np.pi / 2 - (np.arange(h) + 0.5) / h * np.pi
    lon, lat = np.meshgrid(lon, lat)
    return np.cos(lat) * np.cos(lon), np.sin(lat), np.cos(lat) * np.sin(lon), lat, lon


def _hash(ix, iy, iz, seed):
    n = ix * 73856093 ^ iy * 19349663 ^ iz * 83492791 ^ seed * 2654435761
    n = (n ^ (n >> 13)) * 1274126177
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def value_noise(x, y, z, seed):
    ix, iy, iz = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64), np.floor(z).astype(np.int64)
    fx, fy, fz = x - ix, y - iy, z - iz
    sx, sy, sz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    out = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wgt = (sx if dx else 1 - sx) * (sy if dy else 1 - sy) * (sz if dz else 1 - sz)
                out = out + wgt * _hash(ix + dx, iy + dy, iz + dz, seed)
    return out


def fbm(x, y, z, freq, octaves, seed):
    total, amp, norm = 0, 1.0, 0
    for o in range(octaves):
        total = total + amp * value_noise(x * freq, y * freq, z * freq, seed + o)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


def cells(x, y, z, freq, seed):
    """Cheap cellular id: which jittered grid cell is nearest (gives district patches)."""
    px, py, pz = x * freq, y * freq, z * freq
    ix, iy, iz = np.floor(px).astype(np.int64), np.floor(py).astype(np.int64), np.floor(pz).astype(np.int64)
    best = np.full(x.shape, 1e9)
    bid = np.zeros(x.shape)
    edge = np.full(x.shape, 1e9)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cy, cz = ix + dx, iy + dy, iz + dz
                jx = cx + _hash(cx, cy, cz, seed)
                jy = cy + _hash(cx, cy, cz, seed + 1)
                jz = cz + _hash(cx, cy, cz, seed + 2)
                d = (px - jx) ** 2 + (py - jy) ** 2 + (pz - jz) ** 2
                closer = d < best
                edge = np.where(closer, best, np.minimum(edge, d))
                bid = np.where(closer, _hash(cx, cy, cz, seed + 3), bid)
                best = np.minimum(best, d)
    return bid, np.sqrt(edge) - np.sqrt(best)


def save(arr, name):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    Image.fromarray(np.clip(arr * 255, 0, 255).astype(np.uint8)).save(path, quality=86, optimize=True)
    print("wrote", os.path.relpath(path), f"{os.path.getsize(path) // 1024} KB")


def megacity(x, y, z, lat, lon):
    rng = np.random.default_rng(7)
    district, border = cells(x, y, z, 9.0, 11)
    density = fbm(x, y, z, 2.5, 5, 21)
    # street grid in lon/lat, spacing kept roughly constant on the sphere
    coslat = np.maximum(np.cos(lat), 0.15)
    gu = lon * 260 * coslat / np.pi
    gv = lat * 260 / np.pi
    street = ((np.abs(gu - np.round(gu)) < 0.09) | (np.abs(gv - np.round(gv)) < 0.09)).astype(float)
    avenue = ((np.abs(gu / 6 - np.round(gu / 6)) < 0.03) | (np.abs(gv / 6 - np.round(gv / 6)) < 0.03)).astype(float)
    highway = (border < 0.035).astype(float)
    water = (density < 0.33).astype(float)
    detail = fbm(x, y, z, 120.0, 2, 31)

    base = 0.17 + 0.10 * district + 0.08 * detail
    tint = np.stack([base * 0.95, base * 0.98, base * 1.08], -1)
    tint *= (1 - 0.35 * street - 0.25 * avenue - 0.4 * highway)[..., None]
    reservoir = np.array([0.05, 0.08, 0.13])
    albedo = tint * (1 - water[..., None]) + reservoir * water[..., None]
    # polar arcologies: a bit brighter metal near the poles
    polar = np.clip((np.abs(lat) - 1.2) / 0.3, 0, 1)
    albedo = albedo * (1 - polar[..., None] * 0.3) + 0.55 * polar[..., None] * 0.3
    save(albedo, "megacity_albedo.jpg")

    lit = np.clip((density - 0.42) / 0.25, 0, 1) ** 1.5  # dense cores glow, outskirts stay mostly dark
    windows = (rng.random(x.shape) < 0.02 + 0.12 * lit).astype(float)
    glow = (0.8 * highway + 0.45 * avenue + 0.12 * street) * lit + 0.35 * windows * lit
    glow *= 1 - water
    warm = np.array([1.0, 0.72, 0.38])
    cool = np.array([0.55, 0.8, 1.0])
    mix = (district > 0.6).astype(float)[..., None]
    emissive = glow[..., None] * (warm * (1 - mix) + cool * mix)
    save(np.clip(emissive, 0, 1), "megacity_emissive.jpg")


def ocean(x, y, z, lat, lon):
    depth = fbm(x, y, z, 2.6, 7, 51)
    land = depth > 0.70
    shallow = np.clip((depth - 0.56) / 0.14, 0, 1)
    deep = np.array([0.02, 0.10, 0.28])
    mid = np.array([0.03, 0.25, 0.48])
    reef = np.array([0.10, 0.62, 0.66])
    swirl = fbm(x, y, z, 14.0, 3, 61)
    water = deep + (mid - deep) * np.clip(depth / 0.56, 0, 1)[..., None] + (reef - mid) * (shallow**2)[..., None]
    water = water * (0.92 + 0.16 * swirl)[..., None]
    h = np.clip((depth - 0.70) / 0.08, 0, 1)[..., None]
    beach = np.array([0.76, 0.70, 0.50])
    jungle = np.array([0.16, 0.38, 0.14])
    island = beach * (1 - h) + jungle * h
    albedo = np.where(land[..., None], island, water)
    ice = np.clip((np.abs(lat) - 1.35) / 0.15, 0, 1)[..., None]
    albedo = albedo * (1 - ice) + np.array([0.86, 0.92, 0.96]) * ice
    save(albedo, "ocean_albedo.jpg")
    save(np.where(land, 0.0, 1.0) * (1 - ice[..., 0] * 0.7), "ocean_specular.jpg")
    print(f"ocean planet land fraction: {land.mean():.1%}")


if __name__ == "__main__":
    coords = sphere_coords(W, H)
    megacity(*coords)
    ocean(*coords)
