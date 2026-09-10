"""Compile upstream Soar 9.6.5 with a single-thread SML portability patch with its bundled SQLite for WebAssembly.
Usage: python3 scripts/build-soar.py SOAR_SOURCE EMSDK_ROOT BUILD_DIR
"""
import sys,os,subprocess,pathlib,concurrent.futures
source,sdk,build=map(pathlib.Path,sys.argv[1:4]);source=source.resolve();sdk=sdk.resolve();build=build.resolve();build.mkdir(parents=True,exist_ok=True)
project=pathlib.Path(__file__).resolve().parents[1]
# Synchronous embedded WASM does not start remote socket receiver threads.
receiver=source/'Core/KernelSML/src/sml_ConnectionManager.cpp'
receiver_text=receiver.read_text()
if '#ifndef __EMSCRIPTEN__' not in receiver_text:
 receiver.write_text(receiver_text.replace('    m_ReceiverThread->Start() ;','#ifndef __EMSCRIPTEN__\n    m_ReceiverThread->Start() ;\n#endif',1))
 (build/'KernelSML.o').unlink(missing_ok=True)

env=dict(os.environ,EM_CONFIG=str(sdk/'.emscripten'))
cc=sdk/'upstream/emscripten/emcc';cxx=sdk/'upstream/emscripten/em++'
incs=[source/'Core/shared']+[p for p in (source/'Core').rglob('*') if p.is_dir() and 'msvc' not in p.parts and 'SVS' not in p.parts and any(p.glob('*.h'))]
flags=['-O1','-DNDEBUG','-DNO_SVS','-DSTATIC_LINKED','-DNO_TCL','-DPTHREAD_MUTEX_RECURSIVE_NP=PTHREAD_MUTEX_RECURSIVE','-sDISABLE_EXCEPTION_CATCHING=0']+[f'-I{p}' for p in incs]
units=['ClientSML/ClientSML.cxx','ConnectionSML/ConnectionSML.cxx','ElementXML/ElementXML.cxx','KernelSML/KernelSML.cxx','SoarKernel/SoarKernel.cxx','shared/shared.cxx','CLI/CommandLineInterface.cxx']
def compile(src,obj,c=False):
 if obj.exists() and obj.stat().st_mtime>src.stat().st_mtime:return obj
 cmd=[str(cc if c else cxx),*flags,*([] if c else ['-std=c++17']),'-c',str(src),'-o',str(obj)]
 r=subprocess.run(cmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);(build/(obj.name+'.log')).write_text(r.stdout)
 if r.returncode:raise RuntimeError(src.name+'\n'+r.stdout[-6000:])
 print('compiled',src.name,flush=True);return obj
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 jobs=[pool.submit(compile,source/'Core'/p,build/(pathlib.Path(p).stem+'.o')) for p in units]
 objects=[j.result() for j in jobs]
objects.append(compile(source/'Core/SoarKernel/sqlite/sqlite3.c',build/'sqlite3.o',True))
objects.append(compile(project/'kernel/bridge.cpp',build/'bridge.o'))
output=project/'dist/soar/soar.js';output.parent.mkdir(exist_ok=True)
cmd=[str(cxx),*(str(p) for p in objects),'-O1','--bind','-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=SoarModule','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=67108864','-sMAXIMUM_MEMORY=536870912','-sENVIRONMENT=web,worker,node','-sDISABLE_EXCEPTION_CATCHING=0','-sFILESYSTEM=1','-o',str(output)]
r=subprocess.run(cmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);(build/'link.log').write_text(r.stdout)
if r.returncode:raise RuntimeError(r.stdout[-6000:])
output.write_text('\n'.join(line.rstrip() for line in output.read_text().splitlines())+'\n')
print('built',output,flush=True)
