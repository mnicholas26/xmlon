"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const readline = require("readline");
const config = require("./conf.json");
let conf = config;
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
        if (conf[key] !== undefined)
            options[key] = conf[key];
    }
}
let eventCache = [];
load();
async function load() {
    await clean();
    console.log('now watching');
    fs.watch(options.location, { recursive: options.recursive }, (et, fn) => {
        eventCache.push(fn);
        console.log('watched: ' + fn);
        setTimeout(() => {
            eventCache.splice(eventCache.indexOf(fn), 1);
            if (!eventCache.includes(fn))
                program(et, fn);
        }, options.debounce);
    });
}
async function program(et, fn) {
    if (et === 'change')
        compile(fn);
    else if (et === 'rename') {
        if (fs.existsSync(fn))
            compile(fn);
        else {
            let { fn: pfn } = extractFileType(fn);
            let newpath = pfn + '.json';
            try {
                fs.unlink(newpath, () => { });
            }
            catch (err) {
                console.log(err);
            }
        }
    }
}
async function clean(path = options.location) {
    let files = fs.readdirSync(path, { withFileTypes: true });
    let names = files.map((e) => e.name);
    for (const file of files) {
        if (file.isFile()) {
            let { fn, ft } = extractFileType(file.name);
            if (options.types.includes(ft) && !names.includes(fn + '.json'))
                await compile(options.location + fn + '.' + ft);
        }
        else if (options.recursive && file.isDirectory()) {
            await clean(path + file.name + '/');
        }
    }
}
function extractFileType(str) {
    let index = str.lastIndexOf('.');
    let fn = str.slice(0, index);
    let ft = str.slice(index + 1);
    return { fn, ft };
}
function extractFileName(path) {
    let index = path.lastIndexOf('/');
    let p = path.slice(0, index + 1);
    let fn = path.slice(index + 1);
    return { p, fn };
}
async function compile(path) {
    let { fn, ft } = extractFileType(path);
    let out = '';
    if (options.types.includes(ft)) {
        if (ft === 'html')
            out = await compileHTMLON(fn, ft);
        else if (ft === 'svg')
            out = await compileSVGON(fn, ft);
    }
    fs.writeFileSync(fn + '.json', out);
}
async function compileHTMLON(fn, ft) {
    return '';
}
async function compileSVGON(fn, ft) {
    console.log('here im going to compile svg');
    return await compileXML(fn, ft);
}
async function compileXML(fn, ft) {
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
        if (tline.slice(-1) !== '>')
            tline += ' ';
        for (const char of tline) {
            if (char === '<') {
                indent++;
                if (cases[counter] === undefined)
                    cases[counter] = [];
                if (cases[counter][indent] === undefined)
                    cases[counter][indent] = '';
            }
            cases[counter][indent] += char;
            if (char === '>') {
                if (blocks[counter] === undefined)
                    blocks[counter] = [];
                blocks[counter].push(cases[counter][indent]);
                cases[counter][indent] = '';
                indent--;
                if (indent === -1)
                    counter++;
            }
        }
    }
    let obj = convertToXMLON(blocks);
    let { fn: nfn } = extractFileName(fn);
    obj.name = nfn;
    obj = cleanXMLON(obj);
    return JSON.stringify(obj, null, 4);
}
function convertToXMLON(blocks) {
    let indent = -1;
    let whitespaceregex = /\s+(?=(?:[^\'"]*[\'"][^\'"]*[\'"])*[^\'"]*$)/;
    let out = { type: 'svg', name: '' };
    for (const block of blocks) {
        if (block.length === 1) {
            if (block[0].charAt(1) === '?')
                continue;
            else if (block[0].slice(1, 4) === '!--')
                continue;
            else if (block[0].charAt(1) === '/') {
                indent--;
                continue;
            }
            let line = block[0].slice(1, -1);
            let selfclosing = line.slice(-1) === '/';
            if (selfclosing)
                line = line.slice(0, -1).trim();
            let [type, ...attributes] = line.split(whitespaceregex);
            let attr = {};
            for (const att of attributes) {
                let [prop, value] = att.split('=');
                if (value.charAt(0) === '"' || value.charAt(0) === "'")
                    value = value.slice(1, -1);
                attr[prop] = value;
            }
            if (type === 'svg') {
                out.attr = {
                    viewBox: attr['viewBox'],
                };
                out.children = [];
            }
            else {
                let parent = out;
                for (let i = 0; i < indent; i++) {
                    parent = parent.children[parent.children.length - 1];
                }
                if (parent.children === undefined)
                    parent.children = [];
                parent.children.push({ type, attr });
            }
            if (!selfclosing)
                indent++;
        }
    }
    return out;
}
function cleanXMLON(parent) {
    let children = parent.children || [];
    let attr = parent.attr || {};
    let newchildren = [];
    if (parent.type === 'g') {
        if (children.length === 0)
            return undefined;
        else if (children.length === 1 && Object.keys(attr).length === 0)
            return cleanXMLON(children[0]);
    }
    if (Object.keys(attr).length === 0 && children.length === 0)
        return undefined;
    for (const child of children) {
        let node = cleanXMLON(child);
        if (Array.isArray(node)) {
            for (const nodechild of node) {
                newchildren.push(nodechild);
            }
        }
        else if (node !== undefined)
            newchildren.push(node);
    }
    if (parent.type === 'g' && Object.keys(attr).length === 0)
        return newchildren;
    if (newchildren.length > 0)
        parent.children = newchildren;
    return parent;
}
