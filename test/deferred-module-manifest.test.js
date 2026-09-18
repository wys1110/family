import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('config.js','utf8');
const section=source.slice(source.indexOf('  const modules = ['),source.indexOf('  modules.filter('));
const context={window:{}};vm.createContext(context);vm.runInContext(section,context);
test('the update checker and runtime agree on the complete manifest, preventing spurious reloads',()=>{
 const parsed=[...source.matchAll(/\{\s*name:\s*["']([^"']+)["']\s*,\s*version:\s*["']([^"']+)["']/g)].map(m=>`${m[1]}@${m[2]}`).join('|');
 expect(context.window.FAMILY_MODULE_SIGNATURE).toBe(parsed);
});
test('deferred groups retain ordered dependencies and keep admin authorization in the core',()=>{
 const result=vm.runInContext('({core: modules.filter(m => m.script !== false && !deferredNames.has(m.name)).map(m=>m.name), groups:deferredGroups, available:[...modules,...extraModules].map(m=>m.name)})',context);
 expect(result.core).toContain('family-admin');
 expect(result.core).not.toContain('english-stories');
 expect(result.core).not.toContain('settings-backup');
 expect(result.groups.settings.indexOf('family-backup-media')).toBeLessThan(result.groups.settings.indexOf('settings-backup'));
 for(const name of Object.values(result.groups).flat())expect(result.available).toContain(name);
});
