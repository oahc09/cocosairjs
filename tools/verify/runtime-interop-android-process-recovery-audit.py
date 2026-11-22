"""Independent replay of retained-task recovery after controlled background process termination."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import traceback
import xml.etree.ElementTree as ET

from PIL import Image, ImageCms


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', required=True, action='append')
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    out = Path(args.out).resolve(); out.mkdir()
    sha = lambda data: hashlib.sha256(data).hexdigest()
    hashes = {}
    result = {'schema':'air-process-recovery-independent-audit-v1','completed':False,'pass':False,
              'deviceOperations':False,'inputMutations':False,'subset':True,'releaseReady':False,'reports':[]}
    def require(value, message):
        if not value: raise ValueError(message)
    def read(file):
        file = Path(file).resolve(); data = file.read_bytes(); digest = sha(data)
        require(str(file) not in hashes or hashes[str(file)] == digest, 'Input changed while being read')
        hashes[str(file)] = digest
        return data
    def load(file): return json.loads(read(file))
    try:
        read(__file__)
        for file in args.report:
            file = Path(file).resolve(); folder = file.parent; r = load(file)
            require(r['schema'] == 'air-android-process-recovery-v1' and r['pass'] and r['completed'], 'Not a closed complete PASS')
            require(r['cycles'] >= 1 and len(r['phases']) == r['cycles']+1, 'Incomplete phase count')
            require(r['budgets'] == {'killMs':10000,'newReadyMs':30000,'renderMs':15000,'finalExitMs':10000}, 'Budgets differ')
            require(r['inputsUnchanged'] and r['inputs'] == r['finalInputs'], 'Executed inputs did not close')
            for name, digest in r['inputs'].items(): require(sha(read(name)) == digest, 'Current input identity differs: '+name)
            build=load(next(name for name in r['inputs'] if name.endswith('build-report.json')))
            require(build['pass'] and build['apk']['sha256']==r['apkSha256'] and build['sdlVersion']=='3.2.30' and build['androidStl']=='c++_static','Executed APK/build profile differs')
            script = next(v for name,v in r['inputs'].items() if name.endswith('runtime-interop-android-process-recovery.py'))
            require(sha(read(folder/'collector-source.py')) == script, 'Original producer not retained')
            if r['pageBytes'] == 16384:
                require(list(r['compat'].values()) == ['fatal','true'], '16KB fallback policy differs')
            commands = []
            for name in sorted((folder/'commands').glob('*.json')):
                c = load(name); c['stdout'] = read(name.with_suffix('.stdout')); read(name.with_suffix('.stderr'))
                require(c['arguments'][:3] == ['adb','-s',r['serial']] and 0 < c['timeoutSeconds'] <= 15, 'ADB target/budget differs')
                commands.append(c)
            records = []
            for number,line in enumerate(read(folder/'logcat.txt').decode().splitlines()):
                m = re.match(r'^\s*(\d+\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s?(.*)$',line)
                if m: records.append({'line':number,'epoch':float(m[1]),'pid':int(m[2]),'tid':int(m[3]),'priority':m[4],'tag':m[5].strip(),'text':m[6]})
            all_records = [v for v in records if v['epoch'] >= r['startEpoch']]
            phases, previous_session, total_images, seen_pids = [], None, 0, set()
            def package_pids(data):
                lines = data.decode().splitlines()
                require(lines and re.fullmatch(r'\s*PID\s+NAME\s*',lines[0]),'Missing process table header')
                values=[]
                for line in lines[1:]:
                    if not line.strip():continue
                    m=re.fullmatch(r'\s*(\d+)\s+(.+?)\s*',line);require(m is not None,'Invalid process table')
                    if m[2]=='com.mystral.engine.interop' or m[2].startswith('com.mystral.engine.interop:'):values.append(int(m[1]))
                return values
            def task_record(name, task_id):
                raw=read(folder/name).decode()
                ids=set(map(int,re.findall(r'ActivityRecord\{[^\n]*com\.mystral\.engine\.MystralActivity[^\n]*\bt(\d+)\b',raw)))
                require(ids=={task_id},'Retained task ID changed or is ambiguous')
                component=raw.index('mActivityComponent=com.mystral.engine.interop/com.mystral.engine.MystralActivity')
                start=raw.rfind('* Hist ',0,component)
                require(start>=0,'Activity history header missing')
                section=raw[start:]
                return re.split(r'\n\s*\* Hist ',section)[0]
            for index,p in enumerate(r['phases']):
                s = p['session']; epoch = s['activityEpoch']; pid=s['pid']
                require(pid not in seen_pids and epoch==1,'Recovery did not create a new process/first Activity');seen_pids.add(pid)
                records=[v for v in all_records if v['pid']==pid]
                require(not any(v['tag']=='AndroidRuntime' and 'FATAL EXCEPTION' in v['text'] or v['tag']=='libc' and 'Fatal signal' in v['text'] or v['tag']=='MystralJS' and 'V8_EXCEPTION ' in v['text'] for v in records),'Recovered process crashed or raised an uncaught error')
                require(not any('ACTIVITY_NATIVE_LEASE' in v['text'] and 'acquired=0' in v['text'] for v in records),'Native owner admission failed')
                require(load(folder/('phase-'+str(index)+'.session.json'))==s, 'Native PID/session changed incorrectly')
                state = load(folder/('phase-'+str(index)+'.state.json'))
                require(state==p['ready'] and state['session']==s and state['reportSaved'] and state['runtime']['nativeStarted'], 'Actual new scene did not start')
                require(state['runtime']['jsEngine']=='v8' and state['runtime']['backend']=='dawn' and state['runtime']['v8StartupMode']=='embedded', 'Runtime profile differs')
                require(s['caseId']=='demo' and state['runtime']['loadedABI']==build['abi'] and state['runtime']['v8Version']==build['v8Version'] and state['runtime']['entrySha256']==build['payload']['assets']['interop/entry.js'],'Recovered selection/entry/ABI differs from the packaged candidate')
                if previous_session:
                    require(s['parentRunId']==previous_session['runId'] and s['runId']!=previous_session['runId'] and s['token']!=previous_session['token'] and p['taskId']==r['phases'][index-1]['taskId'], 'Old/new session lineage is not isolated')
                life = [json.loads(line) for line in read(folder/('phase-'+str(index)+'.lifecycle.jsonl')).splitlines() if line.strip()]
                created = [v for v in life if v['event']=='created']
                require(len(created)==1 and created[0]['pid']==pid and created[0]['runId']==s['runId'] and created[0]['activityEpoch']==epoch, 'Not a unique actual Activity')
                lease = [v for v in records if v['text']=='ACTIVITY_NATIVE_LEASE epoch='+str(epoch)+' acquired=1 pid='+str(pid)]
                require(len(lease)==1,'Native owner lease is not unique')
                lease=lease[0]
                owned=[v for v in records if v['tid']==lease['tid'] and v['line']>=lease['line']]
                require(package_pids(read(folder/('phase-'+str(index)+'-ready.processes.txt')))==[pid],'Live process evidence differs')
                task_record('phase-'+str(index)+'-ready.activities.txt',p['taskId'])
                if index<r['cycles']:
                    prefix='phase-'+str(index)
                    method=r['terminationMethod']
                    require(method in ['am-kill','uid-sigkill'] and p['termination']==method+'-background-without-normal-teardown','Unexpected termination method')
                    stopped=task_record(prefix+'-stopped.activities.txt',p['taskId'])
                    retained=task_record(prefix+'-retained.activities.txt',p['taskId'])
                    require(re.search(r'^\s*state=STOPPED\b',stopped,re.M),'Target was not actually STOPPED')
                    require('mHaveState=true' in retained and re.search(r'^\s*app=null\s*$',retained,re.M),'Task lost saved state or retained its live process')
                    require(package_pids(read(folder/(prefix+'-before-kill.processes.txt')))==[pid] and not package_pids(read(folder/(prefix+'-after-kill.processes.txt'))),'Old process did not disappear')
                    require(any(v['event']=='pause' for v in life) and not any(v['event']=='destroy' for v in life),'Wrong abrupt-death lifecycle')
                    if p['backgroundMode']=='settings':require(any(v['event']=='surface-destroyed' for v in life),'Settings did not destroy old Surface')
                    require('native-exit.json' not in read(folder/(prefix+'.files-after-kill.txt')).decode().splitlines(),'Abrupt kill mislabelled as normal exit')
                    require(not any(v['text'].startswith('NATIVE_FINISHED ') or v['text'].startswith('ACTIVITY_NATIVE_RELEASE ') for v in records),'Killed process reported normal teardown')
                    for name,digest in p['preservedFiles'].items():
                        before=read(folder/(prefix+'.preserved-'+name));after=read(folder/(prefix+'.rechecked-'+name))
                        require(sha(before)==sha(after)==digest,'Recovery overwrote the prior session')
                    kill_args=['shell','am','kill','--user','current','com.mystral.engine.interop'] if method=='am-kill' else ['shell','run-as','com.mystral.engine.interop','/system/bin/kill','-9',str(pid)]
                    kill=[c for c in commands if c['arguments'][3:]==kill_args and p['killRequestedAt']<=c['startedAt']<=p['killObservedAt']]
                    focus=[c for c in commands if c['arguments'][3:]==['shell','am','task','focus',str(p['taskId'])] and p['resumeRequestedAt']<=c['startedAt']<=p['recoveredSessionAt']]
                    require(len(kill)==len(focus)==1 and kill[0].get('exitCode')==focus[0].get('exitCode')==0,'Missing exact target kill/retained-task restore commands')
                    require(0<=p['killObservedAt']-p['killRequestedAt']<=10,'Kill exceeded ten seconds')
                    require(0<=p['recoveredSessionAt']-p['resumeRequestedAt']<=30,'Discovery exceeded thirty seconds')
                    next_pid=r['phases'][index+1]['session']['pid']
                    ready=next(v for v in all_records if v['pid']==next_pid and v['text']=='REPORT_SAVED '+r['phases'][index+1]['session']['runId'])
                    require(0<=ready['epoch']-focus[0]['startedAt']<=30,'Complete scene readiness exceeded thirty seconds')
                    native_exit=None
                else:
                    released=[v for v in owned if v['text']=='ACTIVITY_NATIVE_RELEASE epoch='+str(epoch)]
                    require(len(released)==1,'Final native lease did not close')
                    markers=['runtime-reset-return','shutdown-jsEngine-return','context-surface-release-return','context-device-destroy-return','context-device-release-return','context-instance-release-return','shutdown-window-return','shutdown-complete','java-exit-notify-return']
                    require(all(any('EXIT_STAGE '+name in v['text'] for v in owned) for name in markers),'Final teardown incomplete')
                    require(any('SURFACE_CONTEXT_CLEANUP' in v['text'] and 'contextWindowRefs=0' in v['text'] for v in owned),'Final ANW/Context references remain')
                    require(any(v['text']=='SDL_OWNED_SUBSYSTEMS_RELEASED remaining=0' for v in owned),'Final SDL subsystem references remain')
                    require(any(v['tid']==lease['tid'] and v['line']>released[0]['line'] and v['tag']=='SDL' and v['text'].strip()=='Finished main function' for v in records) and p['teardown']['pass'],'Final SDL thread did not return')
                    native_exit=p['nativeExit'];require(native_exit['pid']==pid and native_exit['code']==0 and not native_exit['error'],'Final native exit failed')
                    finished=[v for v in owned if v['text'].startswith('NATIVE_FINISHED ')]
                    require(len(finished)==1 and json.loads(finished[0]['text'].split(' ',1)[1])==native_exit,'Wrong final exit attribution')
                # Independently assemble every raw resource PART belonging to this owner.
                snapshots, chunks, sequence, part_total = [], [], None, None
                for v in owned:
                    if not v['text'].startswith('RESOURCE_SNAPSHOT_PART '): continue
                    m = re.fullmatch(r'RESOURCE_SNAPSHOT_PART (\d+) (\d+)/(\d+) (.*)',v['text']); require(m is not None,'Malformed native PART')
                    seq,part,total=map(int,m.group(1,2,3))
                    if not chunks: sequence,part_total=seq,total
                    require(seq==sequence and part==len(chunks) and total==part_total and total>0 and m[4].isascii() and len(m[4])<=512,'Missing or interleaved native PART')
                    chunks.append(m[4])
                    if len(chunks)==total: snapshots.append(json.loads(''.join(chunks)));chunks=[]
                require(not chunks and snapshots and snapshots[0]['stage']=='init','Owner resource stream incomplete')
                require(snapshots[0]['total']['live']==0 and snapshots[0]['wrapper']['live']==0,'Old native/wrapper metadata leaked into new owner')
                previous=None
                for snap in snapshots:
                    require(snap['pid']==pid and len(snap['types'])==18,'Wrong resource scope')
                    if previous: require(snap['sequence']==previous['sequence']+1 and snap['steadyMs']>=previous['steadyMs'],'Resource sequence/clock regressed')
                    for kind,value in snap['types'].items():
                        require(all(type(value[k]) is int and value[k]>=0 for k in ['acquired','released','live','peak']),'Invalid resource integer')
                        require(value['acquired']-value['released']==value['live'] and value['peak']>=value['live'],'Owned resource conservation failed')
                    for k in ['acquired','released','live']:require(sum(v[k] for v in snap['types'].values())==snap['total'][k],'Typed resource sum differs')
                    require(snap['wrapper']['created']-snap['wrapper']['finalized']==snap['wrapper']['live'],'Wrapper accounting differs')
                    require(snap['types']['canvasTexture']['peak']<=1,'Canvas texture not bounded')
                    if snap['stage']!='init': require(snap['types']['canvasTexture']['live']==snap['types']['canvasView']['live']==0,'Expired Canvas leases survive')
                    previous=snap
                if index==r['cycles']:require(snapshots[-1]['stage']=='cleanup' and snapshots[-1]['total']['live']==0 and all(v['live']==0 for v in snapshots[-1]['types'].values()),'Final native references remain after cleanup')
                # Recompute the actual view bounds and whole-image color conversion.
                xml=read(folder/('phase-'+str(index)+'.ui.xml')).decode();tree=ET.fromstring(re.search(r'<hierarchy\b.*?</hierarchy>',xml,re.S).group())
                views=[v for v in tree.iter('node') if v.get('package')=='com.mystral.engine.interop' and v.get('class')=='android.view.SurfaceView'];require(len(views)==1,'View ambiguous')
                x,y,right,bottom=map(int,re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]',views[0].get('bounds')).groups());require(p['bounds']=={'x':x,'y':y,'width':320,'height':240} and (right-x,bottom-y)==(320,240),'Actual bounds differ')
                raw=read(folder/('phase-'+str(index)+'.screen.png'));original=Image.open(io.BytesIO(raw));image=original.convert('RGBA');icc=original.info.get('icc_profile')
                if icc:
                    require(icc==read(folder/('phase-'+str(index)+'.icc')),'Original ICC differs')
                    image=ImageCms.profileToProfile(image,ImageCms.ImageCmsProfile(io.BytesIO(icc)),ImageCms.createProfile('sRGB'),renderingIntent=1,outputMode='RGBA',flags=0)
                srgb=Image.open(io.BytesIO(read(folder/('phase-'+str(index)+'.screen-srgb.png')))).convert('RGBA');crop=Image.open(io.BytesIO(read(folder/('phase-'+str(index)+'.crop.png')))).convert('RGBA')
                require(image.size==srgb.size and image.tobytes()==srgb.tobytes() and image.getchannel('A').tobytes()==original.convert('RGBA').getchannel('A').tobytes(),'Independent whole-image RGBA/alpha replay differs')
                require(0<=x<right<=image.width and 0<=y<bottom<=image.height,'View lies outside real screenshot');require(image.crop((x,y,right,bottom)).tobytes()==crop.tobytes(),'Actual crop differs')
                pixels=crop.tobytes();green=sum(pixels[i+1]>pixels[i]+50 and pixels[i+1]>pixels[i+2]+50 for i in range(0,len(pixels),4));blue=sum(pixels[i+2]>pixels[i]+20 and pixels[i+2]>pixels[i+1]+10 for i in range(0,len(pixels),4))
                require(green>1000 and blue>30000 and p['visual']['green']==green and p['visual']['blue']==blue,'Independent pixel oracle failed')
                events=[json.loads(line) for line in read(folder/('phase-'+str(index)+'.events.jsonl')).splitlines() if line.strip()];event=p['input'];require(event in events and event['isTrusted'] and event['taps']==1 and event['frames']>3 and not event['gpuErrors'],'Real new-scene input/draw proof missing')
                require(event['type']=='mousedown' and abs(event['clientX']-160)<=1 and abs(event['clientY']-120)<=1,'Trusted input coordinates differ')
                taps=[c for c in commands if c['arguments'][3:6]==['shell','input','tap']]
                screens=[c for c in commands if c['arguments'][3:6]==['exec-out','screencap','-p']]
                trees=[c for c in commands if c['arguments'][3:6]==['exec-out','uiautomator','dump']]
                require(len(taps)==len(screens)==len(trees)==len(r['phases']),'Physical action/capture count differs')
                require(taps[index]['arguments'][6:]==[str((x+right)//2),str((y+bottom)//2)] and taps[index]['exitCode']==0,'Actual tap did not target this Surface')
                require(screens[index]['stdout']==raw and 0<=screens[index]['finishedAt']-trees[index]['startedAt']<=15,'Actual render/input capture exceeded its original budget')
                if index<r['cycles']:
                    expected=['shell','input','keyevent','KEYCODE_HOME'] if p['backgroundMode']=='home' else ['shell','am','start','-W','-a','android.settings.SETTINGS']
                    require(any(c['arguments'][3:]==expected and c.get('exitCode')==0 and screens[index]['finishedAt']<=c['startedAt']<=p['killRequestedAt'] for c in commands),'Background action did not precede targeted process kill')
                require(any(c.get('exitCode')==0 and c['arguments'][3:6]==['exec-out','screencap','-p'] and c['stdout']==raw for c in commands),'System image lacks original ADB command')
                total_images+=1
                phases.append({'epoch':epoch,'runId':s['runId'],'pid':pid,'nativeTid':lease['tid'],'nativeExit':native_exit,'snapshots':len(snapshots),'lastNativeLive':snapshots[-1]['total']['live'],'terminatedNormally':index==r['cycles'],'wrapperInitLive':snapshots[0]['wrapper']['live'],'wrapperPreDisposeLive':snapshots[-1]['wrapper']['live'],'profiled':bool(icc),'fullImageRgbaExact':True})
                previous_session=s
            require(r['processCleanup']['finalNormalExitBeforeStop'] and r['logcatClose']['observed'] and not r['logcatClose']['early'] and r['logcatClose']['elapsedMs']<=2000,'Physical shutdown/normal exit gate failed')
            stops=[c for c in commands if c['arguments'][3:]==['shell','am','force-stop','com.mystral.engine.interop']]
            require(len(stops)==2 and stops[0]['startedAt']<trees[0]['startedAt'] and stops[-1]['startedAt']>=p['teardown']['sdlReturnEpochSeconds'],'Force-stop was used inside the recovery scenario')
            table=read(folder/'processes-after-stop.txt').decode().splitlines()
            require(table and re.fullmatch(r'\s*PID\s+NAME\s*',table[0]),'Missing actual process-table header')
            names=[]
            for line in table[1:]:
                if not line.strip():continue
                match=re.fullmatch(r'\s*(\d+)\s+(.+?)\s*',line);require(match is not None,'Malformed process-table row');names.append(match[2])
            require(not any(name=='com.mystral.engine.interop' or name.startswith('com.mystral.engine.interop:') for name in names),'Dedicated package process remains after cleanup')
            result['reports'].append({'report':str(file),'phases':phases,'images':total_images,'pass':True,'noJsStatePersistenceClaim':True})
        for name,digest in hashes.items():require(sha(Path(name).read_bytes())==digest,'Evidence changed before audit closure')
        result.update({'pass':True,'completed':True})
    except Exception: result['error']=traceback.format_exc()
    result['evidenceHashes']=hashes
    (out/'report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'pass':result['pass'],'reports':len(result['reports']),'hashes':len(hashes),'error':result.get('error')}))
    raise SystemExit(0 if result['pass'] else 1)


if __name__=='__main__': main()
