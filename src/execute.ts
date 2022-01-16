import { EasyMetadataEntry } from "@muryllo/easy-decorators";

export function exec<T = any>(context: any, func: any, argsIndexes: EasyMetadataEntry<T>[]){
  if (argsIndexes.length == 0)
    return func.apply(null, []);

  let length = Math.max(...(argsIndexes.map(v => v.index || 0) || [])) + 1;
  let args: any[] = [...Array(length)].map(_ => undefined);

  for (let k = 0; k < argsIndexes.length; k++){
    let arg = argsIndexes[k];
    if (typeof arg.index != "undefined")
      args[arg.index] = arg.value;
  }
  return func.apply(context, args);
}
