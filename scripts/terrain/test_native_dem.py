import tempfile
import unittest
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_origin
from native_dem import load_native_dem


class NativeDemTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.step = 1/3600
        self.bounds = dict(minLon=7, maxLon=7+7*self.step, minLat=46-3*self.step, maxLat=46)

    def source(self, name, offset=0, value=100, point=True):
        path = self.root / name
        with rasterio.open(path, 'w', driver='GTiff', width=4, height=4, count=1,
                           dtype='float32', crs='EPSG:4326',
                           transform=from_origin(7+(offset-.5)*self.step, 46+.5*self.step, self.step, self.step)) as file:
            file.write(np.full((4,4),value,dtype='float32'),1)
            file.update_tags(AREA_OR_POINT='Point' if point else 'Area')
        return path

    def test_join_without_resampling(self):
        a,b=self.source('a.tif'),self.source('b.tif',4,200)
        result,used=load_native_dem([a,b],self.bounds,8,4)
        np.testing.assert_array_equal(result[:,:4],100)
        np.testing.assert_array_equal(result[:,4:],200)
        self.assertEqual(used,[str(a),str(b)])

    def test_missing_coverage_rejected(self):
        with self.assertRaisesRegex(ValueError,'Missing LOCAL'):
            load_native_dem([self.source('a.tif')],self.bounds,8,4)

    def test_off_grid_rejected(self):
        with self.assertRaisesRegex(ValueError,'not aligned'):
            load_native_dem([self.source('a.tif',.5)],self.bounds,8,4)

    def test_pixel_area_rejected(self):
        with self.assertRaisesRegex(ValueError,'PixelIsPoint'):
            load_native_dem([self.source('a.tif',point=False)],self.bounds,8,4)

    def test_nodata_rejected(self):
        with self.assertRaisesRegex(ValueError,'nodata'):
            load_native_dem([self.source('a.tif',value=-32767)],self.bounds,8,4)

    def test_conflicting_overlap_rejected(self):
        with self.assertRaisesRegex(ValueError,'Conflicting'):
            load_native_dem([self.source('a.tif'),self.source('b.tif',3,200)],self.bounds,8,4)


if __name__ == '__main__':
    unittest.main()
