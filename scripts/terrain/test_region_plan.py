"""No Blender, raster or network dependency required."""
import copy
import unittest
from region_plan import DEFAULT, validate_plan, region_for_cell


class RegionPlanTests(unittest.TestCase):
    def plan(self, name='Custom West', bounds=None):
        return {'regions': [*copy.deepcopy(DEFAULT['regions']),
                            {'name': name, 'bounds': bounds or [6.42,45.75,6.70,45.95]}]}

    def test_existing_grid(self):
        p = validate_plan(self.plan('Alps_West_01'))
        self.assertEqual((p['countX'],p['countY'],p['originX'],p['originY']), (8,4,-4,0))
        self.assertEqual(region_for_cell(p,4,0), (DEFAULT['regions'][0],0,3))

    def test_arbitrary_name_and_north(self):
        p = validate_plan(self.plan('Northern Alps', [6.7,45.95,6.98,46.05]))
        self.assertEqual((p['countX'],p['countY']), (4,6))
        self.assertEqual(region_for_cell(p,0,5)[0]['name'], 'Northern Alps')

    def test_south_and_east(self):
        for bbox, shape, origin in [([6.7,45.55,6.98,45.75],(4,8),(0,-4)),
                                    ([6.98,45.75,7.05,45.95],(5,4),(0,0))]:
            p=validate_plan(self.plan(bounds=bbox))
            self.assertEqual((p['countX'],p['countY']),shape)
            self.assertEqual((p['originX'],p['originY']),origin)

    def test_blender_float32_tolerance(self):
        p=validate_plan(self.plan(bounds=[6.420000076,45.75,6.699999809,45.95000076]))
        self.assertEqual(p['bounds']['minLon'],6.42)

    def test_reject_invalid(self):
        cases=[self.plan('MontBlanc'), self.plan('../bad'), self.plan(' '),
               self.plan(bounds=[6.7,45.75,6.98,45.95]),
               self.plan(bounds=[6.42,45.75,6.63,45.95]),
               self.plan(bounds=[6.42,45.75,6.70,45.90]),
               self.plan(bounds=[6.43,45.75,6.70,45.95]),
               self.plan(bounds=[6.70,45.75,6.42,45.95]),
               self.plan(bounds=[float('nan'),45.75,6.70,45.95]),
               self.plan(bounds=[False,45.75,6.70,45.95]),
               self.plan(bounds=[-180,45.75,6.70,45.95]),
               {'regions':[]}, {'regions':[{'name':'Other','bounds':[6.7,45.75,6.98,45.95]}]}]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(ValueError):
                validate_plan(case)

    def test_third_region(self):
        p=self.plan()
        p['regions'].append({'name':'South','bounds':[6.42,45.55,6.98,45.75]})
        p=validate_plan(p)
        self.assertEqual((p['countX'],p['countY']),(8,8))
        self.assertEqual(len({region_for_cell(p,x,y)[0]['name'] for x in range(8) for y in range(8)}),3)


if __name__ == '__main__':
    unittest.main()
