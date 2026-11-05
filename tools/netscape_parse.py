import sys, re, json, html
from html.parser import HTMLParser
from collections import Counter
class P(HTMLParser):
    def __init__(s):
        super().__init__(); s.stack=[]; s.pending=None; s.items=[]; s.cur=None; s.last_h3=None
    def handle_starttag(s,t,a):
        a=dict(a)
        if t=='h3': s.cur=('h3',[]) 
        elif t=='a': s.cur=('a',[]); s.href=a.get('href',''); s.attrs=a
        elif t=='dl':
            s.stack.append(s.last_h3); s.last_h3=None
    def handle_endtag(s,t):
        if t=='h3' and s.cur and s.cur[0]=='h3':
            s.last_h3=''.join(s.cur[1]).strip(); s.cur=None
        elif t=='a' and s.cur and s.cur[0]=='a':
            s.items.append({'url':s.href,'title':html.unescape(''.join(s.cur[1])).strip(),'path':[x for x in s.stack if x],'attrs':s.attrs}); s.cur=None
        elif t=='dl':
            if s.stack: s.stack.pop()
    def handle_data(s,d):
        if s.cur: s.cur[1].append(d)
def parse(f):
    p=P(); p.feed(open(f,encoding='utf-8').read()); return p.items
if __name__=='__main__':
    S=sys.argv[1]
    b=parse(S+'/Bookmarks.html'); r=parse(S+'/ReadingList.html')
    print(len(b),len(r))
    c=Counter(tuple(i['path'][:2]) for i in b)
    for k,v in c.most_common(40): print(v,k)
    print(Counter(re.match(r'[a-z]+',i['url'].lower()).group() if re.match(r'[a-z]+',i['url'].lower()) else '?' for i in b))
    print(len({i['url'] for i in b}))
    print(list(b[0]['attrs'].keys()), r[2]['attrs'].keys())
