import {beforeEach,describe,expect,it,vi} from 'vitest';
const {all,first}=vi.hoisted(()=>({all:vi.fn(),first:vi.fn()}));
vi.mock('@/lib/d1/db',()=>({d1All:all,d1First:first}));
import {getPlaceCollection,getPlaceProfile,getSacredFlagsForPlaceIds,listSacredPlaces} from './calendarGeoPlaces';
beforeEach(()=>{all.mockReset();first.mockReset();});

describe('getPlaceProfile',()=>{
  it('rejects an unknown place with 404 and makes no further calls',async()=>{
    first.mockResolvedValueOnce({found:0});
    await expect(getPlaceProfile('missing','uk')).rejects.toMatchObject({status:404});
    expect(first).toHaveBeenCalledTimes(1);
  });
  it('returns hasProfile:false when the place exists but has no curated profile, with empty hierarchy arrays',async()=>{
    first.mockResolvedValueOnce({found:1}).mockResolvedValueOnce(null);
    all.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // parentPlaces, childPlaces
    const result=await getPlaceProfile('place-1','uk');
    expect(result).toEqual({id:'place-1',hasProfile:false,history:'',address:'',directions:'',openingHours:{},websiteUrl:null,mapUrl:null,territory:null,parentPlaces:[],childPlaces:[]});
    expect(first).toHaveBeenCalledTimes(2);
  });
  it('returns the full profile including a parsed territory and empty hierarchy when no relations exist',async()=>{
    all.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // parentPlaces, childPlaces
    first.mockResolvedValueOnce({found:1})
      .mockResolvedValueOnce({websiteUrl:'https://example.org',mapUrl:'https://maps.example/x',openingHoursJson:'{"mon-sun":"09:00-18:00"}',historyText:'h',address:'a',directions:'d'})
      .mockResolvedValueOnce({geometryType:'Polygon',geometryJson:'{"type":"Polygon","coordinates":[[[30,50],[31,50],[31,51],[30,50]]]}'});
    const result=await getPlaceProfile('place-1','ru');
    expect(result.hasProfile).toBe(true);
    expect(result.openingHours).toEqual({'mon-sun':'09:00-18:00'});
    expect(result.territory).toEqual({type:'Polygon',geometry:{type:'Polygon',coordinates:[[[30,50],[31,50],[31,51],[30,50]]]}});
    expect(result.parentPlaces).toEqual([]);
    expect(result.childPlaces).toEqual([]);
  });

  // Place-to-place hierarchy (calendar_geo_place_relations, 0034) -- the
  // Kyiv-Pechersk Lavra / Dormition Cathedral pilot pair from 0035's seed.
  it('Uspensky Sobor (child) profile returns the Lavra in parentPlaces',async()=>{
    first.mockResolvedValueOnce({found:1}).mockResolvedValueOnce(null);
    all.mockResolvedValueOnce([{id:'place-kyiv-pechersk-lavra',type:'monastery',lat:50.435,lon:30.5578,relationType:'contains',nameLocale:'Києво-Печерська лавра',nameEn:'Kyiv-Pechersk Lavra',canonicalName:'Kyiv-Pechersk Lavra'}]) // parentPlaces
      .mockResolvedValueOnce([]); // childPlaces
    const result=await getPlaceProfile('place-uspensky-sobor','uk');
    expect(result.parentPlaces).toEqual([{id:'place-kyiv-pechersk-lavra',title:'Києво-Печерська лавра',type:'monastery',lat:50.435,lon:30.5578,relationType:'contains'}]);
    expect(result.childPlaces).toEqual([]);
  });
  it('Lavra (parent) profile returns Uspensky Sobor in childPlaces',async()=>{
    first.mockResolvedValueOnce({found:1}).mockResolvedValueOnce(null);
    all.mockResolvedValueOnce([]) // parentPlaces
      .mockResolvedValueOnce([{id:'place-uspensky-sobor',type:'church',lat:50.4344,lon:30.5589,relationType:'contains',nameLocale:'Успенський собор',nameEn:'Dormition Cathedral',canonicalName:'Dormition Cathedral, Kyiv-Pechersk Lavra'}]); // childPlaces
    const result=await getPlaceProfile('place-kyiv-pechersk-lavra','uk');
    expect(result.childPlaces).toEqual([{id:'place-uspensky-sobor',title:'Успенський собор',type:'church',lat:50.4344,lon:30.5589,relationType:'contains'}]);
    expect(result.parentPlaces).toEqual([]);
  });
  it('falls back requested locale -> en -> canonical_name for a related place\'s title',async()=>{
    first.mockResolvedValueOnce({found:1}).mockResolvedValueOnce(null);
    all.mockResolvedValueOnce([
      {id:'place-a',type:'church',lat:1,lon:2,relationType:'contains',nameLocale:'',nameEn:'English name',canonicalName:'Canonical A'}, // uses en fallback
      {id:'place-b',type:'church',lat:3,lon:4,relationType:'contains',nameLocale:null,nameEn:null,canonicalName:'Canonical B'} // uses canonical_name fallback
    ]).mockResolvedValueOnce([]);
    const result=await getPlaceProfile('place-x','ru');
    expect(result.parentPlaces.map(place=>place.title)).toEqual(['English name','Canonical B']);
  });
  it('does not break rendering when a hierarchy relation is needs_review (verification_status is never filtered on)',async()=>{
    // getRelatedPlaces never selects verification_status and never filters on
    // it -- a mocked row without that column at all is the most direct proof
    // the read path doesn't depend on (or gate on) it.
    first.mockResolvedValueOnce({found:1}).mockResolvedValueOnce(null);
    all.mockResolvedValueOnce([{id:'place-kyiv-pechersk-lavra',type:'monastery',lat:50.435,lon:30.5578,relationType:'contains',nameLocale:'Lavra',nameEn:'Lavra',canonicalName:'Lavra'}])
      .mockResolvedValueOnce([]);
    const result=await getPlaceProfile('place-uspensky-sobor','uk');
    expect(result.parentPlaces).toHaveLength(1);
  });
  it('deduplicates a self-referential or repeated related-place row instead of returning it twice',async()=>{
    first.mockResolvedValueOnce({found:1}).mockResolvedValueOnce(null);
    all.mockResolvedValueOnce([
      {id:'place-uspensky-sobor',type:'church',lat:50.4344,lon:30.5589,relationType:'contains',nameLocale:'Self',nameEn:'Self',canonicalName:'Self'}, // same id as the place itself -- must be dropped
      {id:'place-kyiv-pechersk-lavra',type:'monastery',lat:50.435,lon:30.5578,relationType:'contains',nameLocale:'Lavra',nameEn:'Lavra',canonicalName:'Lavra'},
      {id:'place-kyiv-pechersk-lavra',type:'monastery',lat:50.435,lon:30.5578,relationType:'part_of',nameLocale:'Lavra',nameEn:'Lavra',canonicalName:'Lavra'} // duplicate id under a different relation_type -- must not appear twice
    ]).mockResolvedValueOnce([]);
    const result=await getPlaceProfile('place-uspensky-sobor','uk');
    expect(result.parentPlaces).toEqual([{id:'place-kyiv-pechersk-lavra',title:'Lavra',type:'monastery',lat:50.435,lon:30.5578,relationType:'contains'}]);
  });
});

describe('getPlaceCollection',()=>{
  it('rejects an unknown place with 404 without querying products',async()=>{
    first.mockResolvedValueOnce({found:0});
    await expect(getPlaceCollection('missing','uk')).rejects.toMatchObject({status:404});
    expect(all).not.toHaveBeenCalled();
  });
  it('maps product rows into collection items, resolving the photo path',async()=>{
    first.mockResolvedValueOnce({found:1});
    all.mockResolvedValueOnce([{id:'prod-1',slug:'icon-x',nameUk:'Ук',nameRu:'',nameEn:'X',photoUrl:'icons/x.jpg',priceCents:1000,currency:'UAH',stockStatus:'available',relationType:'primary',caption:'cap'}]);
    const result=await getPlaceCollection('place-1','uk');
    expect(result).toEqual({placeId:'place-1',items:[{id:'prod-1',slug:'icon-x',title:'Ук',description:'',productionTime:'',photoUrl:'/icons/x.jpg',priceCents:1000,currency:'UAH',stockStatus:'available',relationType:'primary',caption:'cap'}]});
  });
  it('falls back through locale name columns when the requested one is empty',async()=>{
    first.mockResolvedValueOnce({found:1});
    all.mockResolvedValueOnce([{id:'prod-1',slug:'icon-x',nameUk:'',nameRu:'',nameEn:'English only',photoUrl:'',priceCents:0,currency:'UAH',stockStatus:'unavailable',relationType:'related',caption:''}]);
    const result=await getPlaceCollection('place-1','ru');
    expect(result.items[0].title).toBe('English only');
    expect(result.items[0].photoUrl).toBe('');
  });
});

describe('listSacredPlaces',()=>{
  it('converts D1 0/1 integers to real booleans',async()=>{
    all.mockResolvedValueOnce([{id:'place-1',lat:50,lon:30,type:'monastery',importance:90,title:'T',hasTerritory:1,hasCollection:0}]);
    const result=await listSacredPlaces({west:29,south:49,east:31,north:51},null,'uk');
    expect(result).toEqual([{id:'place-1',lat:50,lon:30,type:'monastery',importance:90,title:'T',hasTerritory:true,hasCollection:false}]);
  });
});

describe('getSacredFlagsForPlaceIds',()=>{
  it('returns an empty map without querying the database when given no ids',async()=>{
    expect(await getSacredFlagsForPlaceIds([])).toEqual({});
    expect(all).not.toHaveBeenCalled();
  });
  it('dedupes ids and maps flags by placeId',async()=>{
    all.mockResolvedValueOnce([{placeId:'place-1',hasProfile:1,hasCollection:0}]);
    const result=await getSacredFlagsForPlaceIds(['place-1','place-1']);
    expect(result).toEqual({'place-1':{hasProfile:true,hasCollection:false}});
    expect(all.mock.calls[0].slice(1)).toEqual(['place-1']);
  });
});
