import fs = require('fs');
import readline = require('readline');
import config = require('./conf.json');
let conf = config as Config;

type FileNameClash = 'resolve' | 'overwrite' | 'skip';

// interface CleaningOptions{
//     removeComments?: boolean;
//     trimHeadings?: boolean;
//     cleanSVG?: boolean;
// }

interface Config {
    location?: string;
    types?: string[];
    recursive?: boolean;
    debounce?: number;
    warnings?: boolean;
    clash?: FileNameClash;
    // clean?: CleaningOptions;
}

let options = {
    location: './',
    types: ['svg', 'html'],
    recursive: true,
    debounce: 500,
    warnings: true,
    clash: 'resolve',
    clean: {
        removeComments: true,
        trimHeadings: true,
        cleanSVG: true,
    },
};
if (config !== undefined) {
    for (const key of Object.keys(options)) {
        if (conf[key] !== undefined) options[key] = conf[key];
    }
}

interface File {
    path: string;
    name: string;
    fn: string;
    ft: string;
}

// let watchfiles: File[] = [];
let eventCache: string[] = [];

load();

async function load() {
    await clean();
    console.log('now watching');
    fs.watch(options.location, { recursive: options.recursive }, (et, fn) => {
        // console.log(et);
        // console.log(fn);
        eventCache.push(fn);
        console.log('watched: ' + fn);
        setTimeout(() => {
            eventCache.splice(eventCache.indexOf(fn), 1);
            if (!eventCache.includes(fn)) program(et, fn);
        }, options.debounce);
    });
}

async function program(et: fs.WatchEventType, fn: string) {
    if (et === 'change') compile(fn);
    else if (et === 'rename') {
        if (fs.existsSync(fn)) compile(fn);
        else {
            let { fn: pfn } = extractFileType(fn);
            let newpath = pfn + '.json';
            try {
                fs.unlink(newpath, () => {});
            } catch (err) {
                console.log(err);
            }
        }
    }
}

async function clean(path = options.location) {
    // console.log(path);
    let files = fs.readdirSync(path, { withFileTypes: true });
    let names = files.map((e) => e.name);
    for (const file of files) {
        if (file.isFile()) {
            // let index = file.name.lastIndexOf('.');
            // let fn = file.name.slice(0, index);
            // let ft = file.name.slice(index + 1);
            let { fn, ft } = extractFileType(file.name);

            // watchfiles.push({
            //     path: path,
            //     name: file.name,
            //     fn,
            //     ft,
            // });

            if (options.types.includes(ft) && !names.includes(fn + '.json'))
                await compile(options.location + fn + '.' + ft);
        } else if (options.recursive && file.isDirectory()) {
            await clean(path + file.name + '/');
        }
    }
}

function extractFileType(str: string) {
    let index = str.lastIndexOf('.');
    let fn = str.slice(0, index);
    let ft = str.slice(index + 1);

    return { fn, ft };
}

function extractFileName(path: string) {
    let index = path.lastIndexOf('/');
    let p = path.slice(0, index + 1);
    let fn = path.slice(index + 1);
    return { p, fn };
}

async function compile(path: string) {
    //console.log(path);
    // let { p, fn } = extractFileName(path);
    // let { fn: nfn, ft } = extractFileType(fn);
    // console.log(p);
    // console.log(nfn);
    // console.log(ft);
    let { fn, ft } = extractFileType(path);
    //console.log(fn);
    //console.log(ft);

    let out = '';

    if (options.types.includes(ft)) {
        if (ft === 'html') out = await compileHTMLON(fn, ft);
        else if (ft === 'svg') out = await compileSVGON(fn, ft);
    }

    fs.writeFileSync(fn + '.json', out);
}

async function compileHTMLON(fn: string, ft: string) {
    //console.log('here i would be compiling html');
    return '';
}

async function compileSVGON(fn: string, ft: string) {
    console.log('here im going to compile svg');
    return await compileXML(fn, ft);
}

async function compileXML(fn: string, ft: string) {
    console.log(fn + '.' + ft);
    const filestream = fs.createReadStream(fn + '.' + ft);
    const rl = readline.createInterface({
        input: filestream,
        crlfDelay: Infinity,
    });

    let out = {
        name: fn,
        type: '',
        attr: {},
        children: [],
    };

    let indent = -1;
    let counter = 0;
    let cases = [];
    let blocks = [];

    for await (const line of rl) {
        let tline = line.trim();
        if (tline.slice(-1) !== '>') tline += ' ';
        for (const char of tline) {
            if (char === '<') {
                indent++;
                if (cases[counter] === undefined) cases[counter] = [];
                if (cases[counter][indent] === undefined)
                    cases[counter][indent] = '';
            }
            cases[counter][indent] += char;
            if (char === '>') {
                if (blocks[counter] === undefined) blocks[counter] = [];
                blocks[counter].push(cases[counter][indent]);
                cases[counter][indent] = '';
                indent--;
                if (indent === -1) counter++;
            }
        }
    }

    // for (const b of blocks) {
    //     console.log(b);
    // }

    let obj: XMLON = convertToXMLON(blocks);
    let { fn: nfn } = extractFileName(fn);
    obj.name = nfn;

    obj = cleanXMLON(obj) as XMLON;
    //console.log('erm');

    //console.log(JSON.stringify(obj, null, 4));

    return JSON.stringify(obj, null, 4);

    // let indent = -1;
    // let blocks = [];
    // let cases = [];
    // for await (const line of rl) {
    //     for (const char of line) {
    //         if (char === '<') {
    //             indent++;
    //             if (cases[indent] === undefined) cases[indent] = '';
    //         }
    //         cases[indent] += char;
    //         if (char === '>') {
    //             blocks.push(cases[indent]);
    //             cases[indent] = '';
    //             indent--;
    //         }
    //     }
    // }
    // console.log(blocks);

    // blocks = removeComments(blocks);
    // console.log(blocks);
}

// function removeComments(arr: string[]) {
//     let out = [];
//     let comment = false;
//     for (const block of arr) {
//         if (block[1] === '!') comment = true;
//         if (!comment) out.push(block);
//         if (block.slice(-3) == '-->') comment = false;
//     }
//     return out;
// }

// function removeComments(arr: string[][]) {
//     let out = [];
//     for (const b of arr) {
//         if (b.length === 1) out.push(b[0]);
//     }
//     return out;
// }

// function trimHeadings(arr: string[]) {
//     let out = [];
//     for(const)
// }

interface XMLONPartial {
    type: string;
    attr?: {
        [property: string]: any;
    };
    children?: XMLONPartial[];
}

interface XMLON extends XMLONPartial {
    name: string;
}

function convertToXMLON(blocks: string[][]) {
    // let out: string[] = [];
    let indent = -1;
    let whitespaceregex = /\s+(?=(?:[^\'"]*[\'"][^\'"]*[\'"])*[^\'"]*$)/;
    let out: XMLON = { type: 'svg', name: '' };
    for (const block of blocks) {
        //remove multi line comments
        if (block.length === 1) {
            //trim headings
            if (block[0].charAt(1) === '?') continue;
            //remove single line comments
            else if (block[0].slice(1, 4) === '!--') continue;
            else if (block[0].charAt(1) === '/') {
                indent--;
                continue;
            }
            let line = block[0].slice(1, -1);
            // if (line.slice(-1) === '/') selfclosing = true;
            // if(selfclosing)
            let selfclosing = line.slice(-1) === '/';
            if (selfclosing) line = line.slice(0, -1).trim();

            let [type, ...attributes] = line.split(whitespaceregex);

            let attr = {};
            for (const att of attributes) {
                let [prop, value] = att.split('=');
                if (value.charAt(0) === '"' || value.charAt(0) === "'")
                    value = value.slice(1, -1);
                attr[prop] = value;
            }

            //clean svg
            if (type === 'svg') {
                // attrloop: for (const att of attr) {
                //     if (att.includes('viewBox')) {
                //         attr = [att];
                //         break attrloop;
                //     }
                // }
                out.attr = {
                    viewBox: attr['viewBox'],
                };
                out.children = [];
            } else {
                let parent = out as XMLONPartial;
                for (let i = 0; i < indent; i++) {
                    parent = parent.children[parent.children.length - 1];
                }
                if (parent.children === undefined) parent.children = [];
                parent.children.push({ type, attr });
            }

            if (!selfclosing) indent++;
        }
    }

    return out;
}

// async function cleanXMLON(xmlon: XMLON) {
//     let parent = xmlon;
//     let children = xmlon.children;
//     let newchildren = [];
//     for (const child of children) {

//         if (child.attr.keys.length > 0 || child.children.length > 0) newchildren.push(child);
//     }
// }

function cleanXMLON(
    parent: XMLON | XMLONPartial
): XMLON | XMLONPartial | XMLONPartial[] {
    let children = parent.children || [];
    let attr = parent.attr || {};
    let newchildren = [];
    if (parent.type === 'g') {
        if (children.length === 0) return undefined;
        else if (children.length === 1 && Object.keys(attr).length === 0)
            return cleanXMLON(children[0]);
        // else if (Object.keys(attr).length === 0) {
        //     for (const child of children) {
        //         let node = cleanXMLON(child);
        //         console.log(node);
        //         if (node !== undefined) newchildren.push(node);
        //         if (Array.isArray(node)) {
        //             for (const nodechild of node) {
        //                 newchildren.push(nodechild);
        //             }
        //         }
        //     }
        // }
    }
    if (Object.keys(attr).length === 0 && children.length === 0)
        return undefined;
    for (const child of children) {
        let node = cleanXMLON(child);
        //console.log(node);
        if (Array.isArray(node)) {
            for (const nodechild of node) {
                newchildren.push(nodechild);
            }
        } else if (node !== undefined) newchildren.push(node);
    }

    if (parent.type === 'g' && Object.keys(attr).length === 0)
        return newchildren;
    // if (parent.type === 'g' && children.length === 0) return;
    // else if(parent.type )
    // if(children.length === 0)
    // for (const child of children) {

    //     if (child.attr.keys.length > 0 || child.children.length > 0) newchildren.push(child);
    // }
    if (newchildren.length > 0) parent.children = newchildren;
    return parent;
}
