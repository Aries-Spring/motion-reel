import json, struct, sys
for p in sys.argv[1:]:
    b = open(p, 'rb').read()
    magic, ver, length = struct.unpack('<4sII', b[:12])
    clen, ctype = struct.unpack('<II', b[12:20])
    j = json.loads(b[20:20+clen])
    ext = j.get('extensions', {})
    print('==', p, list(ext.keys()))
    meta = ext.get('VRMC_vrm', {}).get('meta') or ext.get('VRM', {}).get('meta')
    print(json.dumps(meta, indent=1, ensure_ascii=False)[:2500])
    print('meshes', len(j.get('meshes', [])), 'materials', [m.get('name') for m in j.get('materials', [])])
    print('images', [(i.get('name'), i.get('mimeType')) for i in j.get('images', [])])
    tris = 0
    for m in j['meshes']:
        for pr in m['primitives']:
            if 'indices' in pr: tris += j['accessors'][pr['indices']]['count']//3
    print('tris', tris)
    vrm = ext.get('VRMC_vrm', {})
    ex = vrm.get('expressions', {})
    print('expressions preset', list(ex.get('preset', {}).keys()), 'custom', list(ex.get('custom', {}).keys()))
