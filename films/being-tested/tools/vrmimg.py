import json, struct, sys, os
p, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
b = open(p, 'rb').read()
clen = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + clen])
bin0 = 20 + clen + 8
for i, im in enumerate(j['images']):
    bv = j['bufferViews'][im['bufferView']]
    data = b[bin0 + bv.get('byteOffset', 0): bin0 + bv.get('byteOffset', 0) + bv['byteLength']]
    open(os.path.join(outdir, f"{i:02d}_{im['name']}.png"), 'wb').write(data)
print(len(j['images']), 'images')
# materials summary
for m in j['materials']:
    e = m.get('extensions', {}).get('VRMC_materials_mtoon', {})
    pbr = m.get('pbrMetallicRoughness', {})
    print(m['name'], 'base', pbr.get('baseColorFactor'), 'tex', pbr.get('baseColorTexture', {}).get('index'), 'shade', e.get('shadeColorFactor'), 'alpha', m.get('alphaMode'))
for t in j['textures'][:40]:
    pass
print('textures->images', [t['source'] for t in j['textures']])
