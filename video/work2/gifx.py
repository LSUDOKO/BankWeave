from PIL import Image, ImageSequence
import json
out = {}
for g in ['wokwi-esp32', 'falkordb-browser', 'falkordb-cloud-instance', 'emvlab-decode']:
    im = Image.open(f'../../docs/media/{g}.gif'); t = 0; lst = []
    for i, fr in enumerate(ImageSequence.Iterator(im)):
        fr.convert('RGB').save(f'gif/{g}_{i:03d}.png')
        lst.append([round(t / 1000, 2), f'gif/{g}_{i:03d}.png'])
        t += fr.info.get('duration', 100)
    out[g] = lst
json.dump(out, open('gif/frames.json', 'w'))
