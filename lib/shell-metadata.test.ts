import {expect,it} from 'vitest';
import {shellMetadata} from './shell-metadata';
for(const locale of ['uk','ru','en'] as const)for(const path of ['/','/explore','/about'] as const){
  it(`localizes every metadata surface for ${locale}${path}`,()=>{
    const metadata=shellMetadata(path,locale);
    const title=metadata.title.absolute;
    expect(title.match(/Svet Ikony/g)).toHaveLength(1);
    expect(metadata.description!.length).toBeGreaterThan(50);
    expect(metadata.openGraph).toMatchObject({title,description:metadata.description});
    expect(metadata.twitter).toMatchObject({title,description:metadata.description});
    expect(metadata.alternates?.canonical).toBe(`https://svetikony.com/${locale}${path==='/'?'':path}`);
    const expected={ru:['православная карта','Библиотека','О проекте'],uk:['православна мапа','Бібліотека','Про проєкт'],en:['Orthodox map','Library','About the project']};
    expect(title).toContain(expected[locale][['/','/explore','/about'].indexOf(path)]);
  });
}
