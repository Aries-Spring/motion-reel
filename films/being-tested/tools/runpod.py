#!/usr/bin/env python3
"""runpod.py: run one fixed render job on a RunPod GPU pod, then fetch its outputs.

  python3 runpod.py create --job probe|contact|render|custom [--commit SHA] [--gpu "NVIDIA GeForce RTX 4090"] [--args "..."]
  python3 runpod.py status            pod state + the tail of the job log
  python3 runpod.py get <file> <dest> download a file from the pod's /work/out
  python3 runpod.py kill              terminate the pod (stops billing)

The pod clones this public repo at a pushed commit, installs ffmpeg + the Vulkan loader on the Playwright image,
runs the job's fixed commands (set at creation through the authenticated RunPod API; the pod takes no commands
afterwards) and serves /work/out read-only on port 8000 through RunPod's HTTPS proxy. The film needs no audio to
render picture, so the song never leaves the local machine.

The API key comes from the RUNPOD_API_KEY environment variable and is only ever sent as a request header.
"""
import json, os, sys, time, urllib.request, urllib.error, argparse, pathlib

API = 'https://rest.runpod.io/v1'
STATE = pathlib.Path(os.environ.get('RUNPOD_STATE', pathlib.Path.home() / '.runpod_job.json'))
REPO = 'https://github.com/Aries-Spring/motion-reel'
BRANCH = 'claude/claude-music-video-0gps4j'
IMAGE = 'mcr.microsoft.com/playwright:v1.56.1-noble'
SKILL = '../skills/motion-reel/scripts'

# the pod's whole life: serve /work/out, set up, run the job, keep serving until killed
SETUP = r'''
mkdir -p /work/out
cat > /work/srv.mjs <<'JS'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const R = '/work/out';
http.createServer((q, r) => { const p = path.join(R, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!p.startsWith(R) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-length': fs.statSync(p).size }); fs.createReadStream(p).pipe(r); }).listen(8000, '0.0.0.0');
JS
node /work/srv.mjs > /work/srv.log 2>&1 &
exec > >(tee -a /work/out/job.log) 2>&1
echo "== setup $(date -u +%T)"
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv || true
nproc; free -g | head -2
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq --no-install-recommends git ffmpeg libvulkan1 vulkan-tools libegl1 > /dev/null && echo apt ok
# graphics libs come from the NVIDIA container toolkit (NVIDIA_DRIVER_CAPABILITIES=all); register them if the
# toolkit mounted the libraries but not the loader manifests
if ! ls /etc/vulkan/icd.d/nvidia_icd.json /usr/share/vulkan/icd.d/nvidia_icd.json 2>/dev/null; then
  if ldconfig -p | grep -q libGLX_nvidia.so.0; then mkdir -p /etc/vulkan/icd.d
    echo '{"file_format_version":"1.0.0","ICD":{"library_path":"libGLX_nvidia.so.0","api_version":"1.3"}}' > /etc/vulkan/icd.d/nvidia_icd.json; echo "wrote vulkan icd"; fi; fi
if ! ls /usr/share/glvnd/egl_vendor.d/10_nvidia.json 2>/dev/null; then
  if ldconfig -p | grep -q libEGL_nvidia.so.0; then mkdir -p /usr/share/glvnd/egl_vendor.d
    echo '{"file_format_version":"1.0.0","ICD":{"library_path":"libEGL_nvidia.so.0"}}' > /usr/share/glvnd/egl_vendor.d/10_nvidia.json; echo "wrote egl vendor"; fi; fi
ldconfig -p | grep -E 'nvidia' | grep -E 'GLX|EGL|vulkan' | head
vulkaninfo --summary 2>&1 | grep -E 'deviceName|driverName|apiVersion' | head
git clone -q --depth 60 -b BRANCH REPO /work/repo && cd /work/repo && git checkout -q COMMIT && git log --oneline -1
cd /work/repo/films && npm ci --no-audit --no-fund --loglevel=error && echo npm ok
echo "== job $(date -u +%T)"
'''
TAIL = r'''
echo "== done $(date -u +%T) status $?"
touch /work/out/DONE
sleep infinity
'''
JOBS = {
    'probe': 'node being-tested/tools/gpuprobe.mjs --t 60,120 --n 4',
    'contact': f'node {SKILL}/render.mjs --film being-tested --gpu --contact --every 2 {{args}} && '
               'cd out/being-tested && tar czf /work/out/contact.tgz contact*.png phone*.png',
    'render': f'node {SKILL}/render.mjs --film being-tested --gpu --format 16x9 --video-only {{args}} && '
              'cp out/being-tested/video_16x9.mp4 /work/out/',
    'custom': '{args}',
}


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': 'Bearer ' + os.environ['RUNPOD_API_KEY'], 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        sys.exit(f'{method} {path}: HTTP {e.code} {e.read().decode()[:400]}')


def proxy(pid, f):
    return f'https://{pid}-8000.proxy.runpod.net/{f}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd'); ap.add_argument('rest', nargs='*')
    ap.add_argument('--job', default='probe'); ap.add_argument('--args', default='')
    ap.add_argument('--commit', default='HEAD'); ap.add_argument('--gpu', default='NVIDIA GeForce RTX 4090')
    ap.add_argument('--cloud', default='COMMUNITY'); ap.add_argument('--vcpu', type=int, default=12)
    a = ap.parse_args()
    if a.cmd == 'create':
        commit = a.commit
        if commit == 'HEAD':
            commit = os.popen('git rev-parse HEAD').read().strip()
        script = SETUP.replace('BRANCH', BRANCH).replace('REPO', REPO).replace('COMMIT', commit) + JOBS[a.job].format(args=a.args) + TAIL
        body = {
            'name': f'being-tested-{a.job}', 'imageName': IMAGE, 'cloudType': a.cloud, 'computeType': 'GPU',
            'gpuTypeIds': [g.strip() for g in a.gpu.split(',')], 'gpuCount': 1, 'minVCPUPerGPU': a.vcpu, 'minRAMPerGPU': 24,
            'containerDiskInGb': 40, 'volumeInGb': 0, 'ports': ['8000/http'],
            'env': {'NVIDIA_DRIVER_CAPABILITIES': 'all'},
            'dockerStartCmd': ['bash', '-c', script],
        }
        p = call('POST', '/pods', body)
        STATE.write_text(json.dumps({'id': p['id'], 'job': a.job, 'commit': commit, 'created': time.time()}))
        print(f"pod {p['id']} {p.get('gpu', {}).get('displayName')} ${p.get('costPerHr')}/h  vcpu {p.get('vcpuCount')}  job {a.job} @ {commit[:8]}")
        print('log:', proxy(p['id'], 'job.log'))
    elif a.cmd == 'status':
        s = json.loads(STATE.read_text())
        p = call('GET', f"/pods/{s['id']}")
        print(f"pod {s['id']} {p.get('desiredStatus')} ${p.get('costPerHr')}/h  up {(time.time() - s['created']) / 60:.1f} min")
        try:
            with urllib.request.urlopen(proxy(s['id'], 'job.log'), timeout=30) as r:
                lines = r.read().decode(errors='replace').splitlines()
                n = int(a.rest[0]) if a.rest else 25
                print('\n'.join(lines[-n:]))
        except Exception as e:
            print('log not served yet:', e)
    elif a.cmd == 'get':
        s = json.loads(STATE.read_text())
        f, dest = a.rest
        with urllib.request.urlopen(proxy(s['id'], f), timeout=600) as r, open(dest, 'wb') as o:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                o.write(b)
        print(dest, os.path.getsize(dest), 'bytes')
    elif a.cmd == 'kill':
        s = json.loads(STATE.read_text())
        call('DELETE', f"/pods/{s['id']}")
        print('terminated', s['id'])


if __name__ == '__main__':
    main()
