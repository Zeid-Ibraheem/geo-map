"""Tests du script de données : python3 -m unittest discover tests"""

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from geomap import transform as tf  # noqa: E402
from geomap.indicators import load_indicator, parse_imf, parse_worldbank  # noqa: E402

REPO = Path(__file__).resolve().parent.parent


class TransformTests(unittest.TestCase):
    def test_keep_and_props(self):
        feats = [
            {"type": "Feature", "geometry": None, "properties": {"featurecla": "Admin-0 capital", "name": "Paris", "x": 1}},
            {"type": "Feature", "geometry": None, "properties": {"featurecla": "Populated place", "name": "Nancy", "x": 2}},
        ]
        kept = tf.select_props(tf.keep_matching(feats, {"featurecla": ["Admin-0 capital"]}), ["name"])
        self.assertEqual([f["properties"] for f in kept], [{"name": "Paris"}])

    def test_points_from_records_skips_missing(self):
        pts = tf.points_from_records([{"Latitude": 48.7, "Longitude": 6.2, "Name": "A"}, {"Latitude": None, "Longitude": 1}], "Latitude", "Longitude")
        self.assertEqual(len(pts), 1)
        self.assertEqual(pts[0]["geometry"]["coordinates"], [6.2, 48.7])
        self.assertEqual(pts[0]["properties"], {"Name": "A"})

    def test_simplify_removes_collinear_points(self):
        line = [[0, 0], [1, 0.0001], [2, 0], [3, 5]]
        self.assertEqual(tf.simplify_line(line, 0.01), [[0, 0], [2, 0], [3, 5]])

    def test_simplify_keeps_small_rings_valid(self):
        ring = [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]]
        geom = tf.transform_geometry({"type": "Polygon", "coordinates": [ring]}, precision=None, simplify=1)
        self.assertGreaterEqual(len(geom["coordinates"][0]), 4)

    def test_precision(self):
        geom = tf.transform_geometry({"type": "Point", "coordinates": [1.23456, 2.98765]}, precision=2, simplify=None)
        self.assertEqual(geom["coordinates"], [1.23, 2.99])

    def test_empty_geometry(self):
        geom = tf.transform_geometry({"type": "MultiLineString", "coordinates": [[]]}, precision=3, simplify=0.01)
        self.assertEqual(geom["coordinates"], [[]])

    def test_countries_iso_fallback(self):
        feats = [{"type": "Feature", "geometry": None, "properties": {"ISO_A3_EH": "-99", "ADM0_A3": "KOS", "NAME_FR": None, "NAME": "Kosovo"}}]
        out = tf.prepare_countries(feats, ["ISO_A3_EH", "ADM0_A3"], ["NAME_FR", "NAME"])
        self.assertEqual(out[0]["properties"], {"iso3": "KOS", "name": "Kosovo"})


class IndicatorTests(unittest.TestCase):
    def test_worldbank(self):
        payload = [{"page": 1}, [
            {"countryiso3code": "FRA", "date": "2024", "value": 3.1e12},
            {"countryiso3code": "", "date": "2024", "value": 1},
            {"countryiso3code": "XXX", "date": "2024", "value": None},
        ]]
        self.assertEqual(parse_worldbank(payload), {"FRA": {"v": 3.1e12, "y": 2024}})

    def test_worldbank_error_message(self):
        with self.assertRaises(ValueError):
            parse_worldbank([{"message": [{"value": "Invalid indicator"}]}])

    def test_imf_ignores_projections(self):
        payload = {"values": {"GGXWDG_NGDP": {"FRA": {"2024": 113.0, "2025": 116.0, "2030": 125.0}}}}
        self.assertEqual(parse_imf(payload, "GGXWDG_NGDP", 2025), {"FRA": {"v": 116.0, "y": 2025}})

    def test_sipri_file(self):
        spec = {"provider": "file", "path": "static-data/nuclear-warheads-sipri-2026.json", "field": "total_inventory"}
        values = load_indicator(spec, get_json=None, repo_root=REPO, today=date(2026, 11, 21))
        self.assertEqual(len(values), 9)
        self.assertEqual(sum(v["v"] for v in values.values()), 12187)  # total publié par le SIPRI
        deployed = load_indicator({**spec, "field": "deployed"}, get_json=None, repo_root=REPO)
        self.assertEqual(sum(v["v"] for v in deployed.values()), 4012)


if __name__ == "__main__":
    unittest.main()
