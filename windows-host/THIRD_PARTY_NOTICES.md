# Third-party notices

## StreamGet Huya live-stream parser reference

- Project: https://github.com/ihmily/streamget
- Referenced module: `streamget/platforms/huya/live_stream.py`
- License: MIT

DeskFish ports the public-room metadata parsing and rotating HLS signature behavior into its bundled C# local engine. It does not bundle livestream content; the local proxy requests short-lived public stream manifests and segments only while the user is watching.

MIT License

Copyright (c) 2025 Hmily

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Project Gutenberg OPDS integration

- Catalog and text provider: https://www.gutenberg.org/
- Official OPDS catalog: https://www.gutenberg.org/ebooks/search.opds/
- Catalog API design reference: https://github.com/garethbjohnson/gutendex

DeskFish independently implements an OPDS client and chapter splitter. It does not copy Gutendex code or bundle Project Gutenberg books; public-domain text is downloaded only after a user selects a book and is cached on that user's computer. Project Gutenberg's trademark and redistribution terms remain applicable to its content.

## Qidian public-page integration

DeskFish independently parses publicly returned search, catalog, and chapter data from `m.qidian.com`. No Qidian content is bundled in the repository or release package. Only chapters returned by the official site as publicly readable are cached after the user selects a work; subscription chapters remain disabled, and DeskFish does not emulate purchases, decrypt paid content, or store account cookies. Qidian, 起点中文网, Yuewen, book titles, and cover art remain the property of their respective owners.

## Baozi manga-source integration reference

- Service: https://www.baozimh.com
- Open-source behavior reference: https://github.com/miru-project/repo/blob/main/repo/baozimh.com.js
- Reference project: https://github.com/miru-project/repo
- License: MIT

DeskFish contains independently adapted C# connectors based on the public behavior documented by the reference. It does not bundle or redistribute comic pages.

Additional reference connectors:

- Komiic: https://github.com/miru-project/repo/blob/main/repo/komiic.com.js
- YY漫画: https://github.com/miru-project/repo/blob/main/repo/yymanhua.com.js

MIT License

Copyright (c) 2023 miru-project

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
