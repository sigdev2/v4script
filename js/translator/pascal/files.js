// Pascal: files. Text files are read from the files of the host and from
// the "files in memory" of the session; Rewrite and Append write only to
// memory (until the variables are reset). Typed files (file of T) live only
// in memory.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    var Runtime = Pascal.Runtime;
    if (Runtime.prototype.fwrite)
        return;

    var utf8 = T.utf8;

    // A file variable: the name, the mode, the data to read, the write buffer.
    function PascalFile(type) {
        this.typed = type !== null && type !== undefined && !type.text;
        this.elementType = this.typed ? type.of : null;
        this.name = '';
        this.mode = 'closed';
        this.data = '';
        this.records = null;
        this.pos = 0;
        this.out = '';
        this.console = null;
    }
    Pascal.PascalFile = PascalFile;

    Pascal.makeFile = function (type) {
        return new PascalFile(type);
    };

    Runtime.prototype.consoleFile = function (kind) {
        var file = new PascalFile(null);
        file.console = kind;
        file.mode = kind === 'input' ? 'read' : 'write';
        return file;
    };

    // Standard input: lines of the host (see more()).
    Runtime.prototype.input = function () {
        if (this.inputFile === undefined)
            this.inputFile = this.consoleFile('input');
        return this.inputFile;
    };

    // An I/O error: an exception with {$I+}, IOResult with {$I-}.
    Runtime.prototype.ioError = function (code, check) {
        if (check)
            this.re(code);
        if (this.ioResult === 0)
            this.ioResult = code;
    };

    Runtime.prototype.takeIoResult = function () {
        var code = this.ioResult;
        this.ioResult = 0;
        return code;
    };

    Runtime.prototype.memoryFiles = function () {
        return this.session.memoryFiles;
    };

    Runtime.prototype.file_assign = function (file, name) {
        file.name = name;
        file.mode = 'closed';
    };

    Runtime.prototype.file_reset = function (file, recordSize, check) {
        if (check === undefined) {
            check = recordSize;
            recordSize = undefined;
        }
        if (this.ioResult !== 0 && !check)
            return;
        if (file.console !== null) {
            file.pos = 0;
            return;
        }
        if (file.name === '') {
            this.ioError(102, check);
            return;
        }
        var stored = this.memoryFiles()[file.name];
        if (file.typed) {
            if (stored === undefined || !Array.isArray(stored)) {
                this.ioError(2, check);
                return;
            }
            file.records = stored;
            file.mode = 'readwrite';
            file.pos = 0;
            return;
        }
        var text = stored;
        if (text === undefined) {
            var attachment = this.env.readModule(utf8.decode(file.name));
            if (attachment === null || attachment === undefined) {
                this.ioError(2, check);
                return;
            }
            text = utf8.encode(attachment);
        }
        file.data = typeof text === 'string' ? text : '';
        file.pos = 0;
        file.mode = 'read';
    };

    Runtime.prototype.file_rewrite = function (file, recordSize, check) {
        if (check === undefined) {
            check = recordSize;
            recordSize = undefined;
        }
        if (this.ioResult !== 0 && !check)
            return;
        if (file.console !== null)
            return;
        if (file.name === '') {
            this.ioError(102, check);
            return;
        }
        if (file.typed) {
            file.records = [];
            this.memoryFiles()[file.name] = file.records;
            file.mode = 'readwrite';
            file.pos = 0;
            return;
        }
        file.out = '';
        file.mode = 'write';
        this.memoryFiles()[file.name] = '';
    };

    Runtime.prototype.file_append = function (file, check) {
        if (this.ioResult !== 0 && !check)
            return;
        if (file.console !== null)
            return;
        var stored = this.memoryFiles()[file.name];
        if (stored === undefined) {
            var attachment = this.env.readModule(utf8.decode(file.name));
            if (attachment === null || attachment === undefined) {
                this.ioError(2, check);
                return;
            }
            stored = utf8.encode(attachment);
        }
        file.out = String(stored);
        file.mode = 'write';
        this.memoryFiles()[file.name] = file.out;
    };

    Runtime.prototype.file_close = function (file, check) {
        if (file.console !== null)
            return;
        if (file.mode === 'closed') {
            this.ioError(103, check);
            return;
        }
        if (file.mode === 'write')
            this.memoryFiles()[file.name] = file.out;
        file.mode = 'closed';
    };

    Runtime.prototype.file_flush = function (file) {
        if (file.console !== null)
            this.flush();
        else if (file.mode === 'write')
            this.memoryFiles()[file.name] = file.out;
    };

    Runtime.prototype.file_erase = function (file, check) {
        var files = this.memoryFiles();
        if (files[file.name] === undefined) {
            this.ioError(2, check);
            return;
        }
        delete files[file.name];
    };

    Runtime.prototype.file_rename = function (file, name, check) {
        var files = this.memoryFiles();
        if (files[file.name] === undefined) {
            this.ioError(2, check);
            return;
        }
        files[name] = files[file.name];
        delete files[file.name];
        file.name = name;
    };

    // --- Writing

    Runtime.prototype.fwrite = function (file, text) {
        if (file.console === 'output') {
            this.w(text);
            return;
        }
        if (file.console === 'error') {
            this.werr(text);
            return;
        }
        if (file.mode !== 'write') {
            this.ioError(file.mode === 'closed' ? 103 : 105, true);
            return;
        }
        file.out += text;
    };

    Runtime.prototype.fwriteTyped = function (file, values) {
        if (file.mode !== 'readwrite') {
            this.ioError(103, true);
            return;
        }
        var type = file.elementType;
        for (var index = 0; index < values.length; ++index) {
            var value = Pascal.types.isAggregate(type) ? type.clone(values[index]) : values[index];
            file.records[file.pos++] = value;
        }
    };

    // --- Reading text files

    function isSpace(code) {
        return code === 32 || code === 9 || code === 10 || code === 13 || code === 26;
    }

    // True if the file has text at its position. Standard input takes the
    // next line of the host when the read one ends.
    function more(rt, file) {
        if (file.pos < file.data.length)
            return true;
        if (file.console !== 'input')
            return false;
        rt.flush();
        var line = rt.env.input.readLine();
        if (line === null)
            return false;
        file.data = file.data.substring(file.pos) + utf8.encode(line + '\n');
        file.pos = 0;
        return true;
    }
    Pascal.moreInput = more;

    Runtime.prototype.readableFile = function (file) {
        if (file.console === 'input')
            return file;
        if (file.mode !== 'read') {
            this.ioError(file.mode === 'closed' ? 103 : 104, true);
            return null;
        }
        return file;
    };

    // Read(f, x): an integer or a real - a word; a string - to the end of
    // the line; a char.
    Runtime.prototype.fread = function (file, kind) {
        var source = this.readableFile(file);
        if (source === null) {
            if (kind === 'string')
                return '';
            if (kind === 'char')
                return 26;
            return 0;
        }
        if (kind === 'char') {
            if (!more(this, source))
                return 26;
            return source.data.charCodeAt(source.pos++);
        }
        if (kind === 'string') {
            if (!more(this, source))
                return '';
            var start = source.pos;
            while (source.pos < source.data.length && source.data.charCodeAt(source.pos) !== 10 &&
                   source.data.charCodeAt(source.pos) !== 13)
                ++source.pos;
            return source.data.substring(start, source.pos);
        }
        while (more(this, source) && isSpace(source.data.charCodeAt(source.pos)))
            ++source.pos;
        if (source.pos >= source.data.length)
            return 0;
        var begin = source.pos;
        while (source.pos < source.data.length && !isSpace(source.data.charCodeAt(source.pos)))
            ++source.pos;
        var token = source.data.substring(begin, source.pos);
        var parsed = kind === 'int' ? Pascal.valInt(token, 'i64') : Pascal.valReal(token);
        if (parsed.code !== 0) {
            this.ioError(106, true);
            return 0;
        }
        return parsed.value;
    };

    Runtime.prototype.freadln = function (file) {
        var source = this.readableFile(file);
        if (source === null || !more(this, source))
            return;
        var data = source.data;
        while (source.pos < data.length && data.charCodeAt(source.pos) !== 10 && data.charCodeAt(source.pos) !== 13)
            ++source.pos;
        if (source.pos < data.length && data.charCodeAt(source.pos) === 13)
            ++source.pos;
        if (source.pos < data.length && data.charCodeAt(source.pos) === 10)
            ++source.pos;
    };

    Runtime.prototype.freadValue = function (file) {
        if (file.mode !== 'readwrite') {
            this.ioError(103, true);
            return null;
        }
        if (file.pos >= file.records.length) {
            this.ioError(100, true);
            return null;
        }
        return file.records[file.pos++];
    };

    Runtime.prototype.freadTyped = function (file, target) {
        var value = this.freadValue(file);
        if (value !== null)
            file.elementType.assign(target, value);
    };

    Runtime.prototype.file_eof = function (file) {
        if (file.console === 'input')
            return !more(this, file);
        if (file.typed)
            return file.records === null || file.pos >= file.records.length;
        if (file.mode !== 'read')
            return true;
        return file.pos >= file.data.length;
    };

    Runtime.prototype.file_eoln = function (file) {
        if (file.console === 'input' ? !more(this, file) : (file.mode !== 'read' || file.pos >= file.data.length))
            return true;
        var code = file.data.charCodeAt(file.pos);
        return code === 10 || code === 13;
    };

    Runtime.prototype.file_seekeof = function (file) {
        if (file.console !== 'input' && file.mode !== 'read')
            return true;
        while (more(this, file) && isSpace(file.data.charCodeAt(file.pos)))
            ++file.pos;
        return file.pos >= file.data.length;
    };

    Runtime.prototype.file_seekeoln = function (file) {
        if (file.console !== 'input' && file.mode !== 'read')
            return true;
        if (!more(this, file))
            return true;
        while (file.pos < file.data.length && (file.data.charCodeAt(file.pos) === 32 || file.data.charCodeAt(file.pos) === 9))
            ++file.pos;
        return this.file_eoln(file);
    };

    Runtime.prototype.file_filepos = function (file) {
        return file.pos;
    };

    Runtime.prototype.file_filesize = function (file) {
        if (file.typed)
            return file.records === null ? 0 : file.records.length;
        return file.mode === 'read' ? file.data.length : file.out.length;
    };

    Runtime.prototype.file_seek = function (file, position, check) {
        if (!file.typed) {
            this.ioError(103, check);
            return;
        }
        file.pos = Math.max(0, Number(position));
    };

    Runtime.prototype.file_truncate = function (file) {
        if (file.typed && file.records !== null)
            file.records.length = Math.min(file.records.length, file.pos);
    };
})(globalThis);
