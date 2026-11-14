"""Independent closed-report replay for short same-PID Activity recreation."""
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
    result = {'schema':'air-activity-recreate-independent-audit-v1','completed':False,'pass':False,
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
            require(r['schema'] == 'air-android-activity-recreate-v1' and r['pass'] and r['completed'], 'Not a closed complete PASS')
            require(r['cycles'] >= 1 and len(r['phases']) == r['cycles']+1, 'Incomplete phase count')
            require(r['budgets'] == {'oldExitMs':10000,'newReadyMs':30000,'renderMs':15000}, 'Budgets differ')
            require(r['inputsUnchanged'] and r['inputs'] == r['finalInputs'], 'Executed inputs did not close')
            for name, digest in r['inputs'].items(): require(sha(read(name)) == digest, 'Current input identity differs: '+name)
            script = next(v for name,v in r['inputs'].items() if name.endswith('runtime-interop-android-recreate.py'))
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
            pid = r['phases'][0]['session']['pid']
            records = [v for v in records if v['pid'] == pid and v['epoch'] >= r['startEpoch']]
            require(not any(v['tag']=='AndroidRuntime' and 'FATAL EXCEPTION' in v['text'] or v['tag']=='libc' and 'Fatal signal' in v['text'] or v['tag']=='MystralJS' and 'V8_EXCEPTION ' in v['text'] for v in records), 'Current PID crashed or raised an uncaught V8 callback error')
            require(not any('ACTIVITY_NATIVE_LEASE' in v['text'] and 'acquired=0' in v['text'] for v in records), 'Concurrent native owner was attempted')
            phases, previous_release, previous_session, total_images = [], None, None, 0
            for index,p in enumerate(r['phases']):
                s = p['session']; epoch = s['activityEpoch']
                require(s['pid']==pid and load(folder/('phase-'+str(index)+'.session.json'))==s, 'Native PID/session changed incorrectly')
                state = load(folder/('phase-'+str(index)+'.state.json'))
                require(state==p['ready'] and state['session']==s and state['reportSaved'] and state['runtime']['nativeStarted'], 'Actual new scene did not start')
                require(state['runtime']['jsEngine']=='v8' and state['runtime']['backend']=='dawn' and state['runtime']['v8StartupMode']=='embedded', 'Runtime profile differs')
                if previous_session:
                    require(s['parentRunId']==previous_session['runId'] and s['runId']!=previous_session['runId'] and s['token']!=previous_session['token'] and epoch>previous_session['activityEpoch'], 'Old/new session lineage is not isolated')
                life = [json.loads(line) for line in read(folder/('phase-'+str(index)+'.lifecycle.jsonl')).splitlines() if line.strip()]
                created = [v for v in life if v['event']=='created']
                require(len(created)==1 and created[0]['pid']==pid and created[0]['runId']==s['runId'] and created[0]['activityEpoch']==epoch, 'Not a unique actual Activity')
                lease = [v for v in records if v['text']=='ACTIVITY_NATIVE_LEASE epoch='+str(epoch)+' acquired=1 pid='+str(pid)]
                released = [v for v in records if v['text']=='ACTIVITY_NATIVE_RELEASE epoch='+str(epoch)]
                require(len(lease)==len(released)==1 and released[0]['line']>lease[0]['line'], 'Native owner lease did not close')
                lease, released = lease[0], released[0]
                if previous_release:
                    require(lease['line']>previous_release['line'], 'Native owners overlapped')
                    report_saved = next(v for v in records if v['text']=='REPORT_SAVED '+s['runId'])
                    require(0<=report_saved['epoch']-previous_release['epoch']<=30, 'New scene readiness exceeded thirty seconds')
                owned = [v for v in records if lease['line']<=v['line']<=released['line'] and v['tid']==lease['tid']]
                markers=['runtime-reset-return','shutdown-jsEngine-return','context-surface-release-return','context-device-destroy-return','context-device-release-return','context-instance-release-return','shutdown-window-return','shutdown-complete','java-exit-notify-return']
                require(all(any('EXIT_STAGE '+name in v['text'] for v in owned) for name in markers), 'Old owner teardown incomplete')
                require(any('SURFACE_CONTEXT_CLEANUP' in v['text'] and 'contextWindowRefs=0' in v['text'] for v in owned), 'ANW/Context refs not zero')
                require(any(v['text']=='SDL_OWNED_SUBSYSTEMS_RELEASED remaining=0' for v in owned), 'SDL subsystem references survive the owner')
                sdl = next((v for v in records if v['tid']==lease['tid'] and v['line']>released['line'] and v['tag']=='SDL' and v['text'].strip()=='Finished main function'),None)
                require(sdl and p['teardown']['pass'] and p['teardown']['ownerTid']==lease['tid'], 'Actual SDL thread did not return')
                native_exit = p['nativeExit']; require(native_exit['pid']==pid and native_exit['code']==0 and not native_exit['error'], 'Old session exit failed')
                finished = [v for v in owned if v['text'].startswith('NATIVE_FINISHED ')]
                require(len(finished)==1 and json.loads(finished[0]['text'].split(' ',1)[1])==native_exit, 'Exit was attributed to another Activity')
                if index<r['cycles']:
                    requests=[v for v in life if v['event']=='recreate-requested']; require(len(requests)==1,'Real recreate request missing')
                    require(0<=native_exit['elapsedRealtime']-requests[0]['elapsedRealtime']<=10000, 'Old native exit exceeded original ten seconds')
                    require(any(v['event']=='destroy' for v in life), 'Framework did not destroy old Activity')
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
                require(not chunks and snapshots[0]['stage']=='init' and snapshots[-1]['stage']=='cleanup','Owner resource stream incomplete')
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
                require(snapshots[-1]['total']['live']==0 and all(v['live']==0 for v in snapshots[-1]['types'].values()),'Native references remain after cleanup')
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
                require(image.crop((x,y,right,bottom)).tobytes()==crop.tobytes(),'Actual crop differs')
                pixels=crop.tobytes();green=sum(pixels[i+1]>pixels[i]+50 and pixels[i+1]>pixels[i+2]+50 for i in range(0,len(pixels),4));blue=sum(pixels[i+2]>pixels[i]+20 and pixels[i+2]>pixels[i+1]+10 for i in range(0,len(pixels),4))
                require(green>1000 and blue>30000 and p['visual']['green']==green and p['visual']['blue']==blue,'Independent pixel oracle failed')
                events=[json.loads(line) for line in read(folder/('phase-'+str(index)+'.events.jsonl')).splitlines() if line.strip()];event=p['input'];require(event in events and event['isTrusted'] and event['taps']==1 and event['frames']>3 and not event['gpuErrors'],'Real new-scene input/draw proof missing')
                require(event['type']=='mousedown' and abs(event['clientX']-160)<=1 and abs(event['clientY']-120)<=1,'Trusted input coordinates differ')
                require(any(c.get('exitCode')==0 and c['arguments'][3:6]==['exec-out','screencap','-p'] and c['stdout']==raw for c in commands),'System image lacks original ADB command')
                total_images+=1
                phases.append({'epoch':epoch,'runId':s['runId'],'pid':pid,'nativeTid':lease['tid'],'nativeExit':native_exit,'snapshots':len(snapshots),'finalNativeLive':snapshots[-1]['total']['live'],'wrapperInitLive':snapshots[0]['wrapper']['live'],'wrapperPreDisposeLive':snapshots[-1]['wrapper']['live'],'profiled':bool(icc),'fullImageRgbaExact':True})
                previous_release,previous_session=released,s
            require(r['processCleanup']['normalExitsBeforeStop'] and r['logcatClose']['observed'] and not r['logcatClose']['early'] and r['logcatClose']['elapsedMs']<=2000,'Physical shutdown/normal exit gate failed')
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
