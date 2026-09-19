export function progressiveSearch<V extends {search:string}, M extends {status:string}>(
  variants:V[],
  search:(variant:V)=>Promise<string[]>,
  assess:(ids:string[])=>Promise<M>,
):Promise<{match:M;searches:(V&{hits:number})[]}>;
