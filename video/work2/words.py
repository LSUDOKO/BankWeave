import asyncio, json, edge_tts
lines=json.load(open('../vo/lines.json'))
ids=['08-hardware','09-mcp','10-browser','11-lab','12-eval','13-end']
async def go():
    out={}
    for i in ids:
        c=edge_tts.Communicate(lines[i],'en-US-AndrewMultilingualNeural',rate='+4%',boundary='WordBoundary')
        w=[]
        async for ch in c.stream():
            if ch['type']=='WordBoundary': w.append([round(ch['offset']/1e7,2),ch['text']])
        out[i]=w
    json.dump(out,open('words.json','w'))
asyncio.run(go())
