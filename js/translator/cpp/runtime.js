// C++: the run time of translated code - the helpers $c of a session:
// exceptions (a C++ exception is a JavaScript exception that carries the
// address of the thrown object and its type), RTTI records, dynamic_cast,
// delete through a virtual destructor, arrays with a length cookie. The
// rest is the run time of C (js/translator/c/runtime.js).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp;
    if (X.runtime)
        return;

    var CError = C.runtime.CError;

    // A thrown C++ object: its address (on the heap), its type (an RTTI
    // record) and its destructor (a function or null).
    function CppException(address, rtti, dtor) {
        T.LanguageError.call(this, "terminate called after throwing an instance of '" + rtti.name + "'", null);
        this.address = address;
        this.rtti = rtti;
        this.dtor = dtor;
        this.rethrown = false;
    }
    CppException.prototype = Object.create(T.LanguageError.prototype);
    X.CppException = CppException;

    // The offset of the subobject of class 'base' in an object of the
    // class of 'from' (public bases only), or -1.
    function baseOffset(from, base) {
        if (from === base)
            return 0;
        for (var index = 0; index < from.bases.length; ++index) {
            var item = from.bases[index];
            if (!item.isPublic)
                continue;
            var inner = baseOffset(item.rtti, base);
            if (inner >= 0)
                return item.offset + inner;
        }
        return -1;
    }
    X.rttiBaseOffset = baseOffset;

    // The helpers of a session ($c in chunks).
    X.runtime = function (session) {
        var memory = session.memory;
        var vtables = session.vtables;
        var caughtStack = [];
        var helpers = Object.create(C.runtime);

        helpers.CExit = C.runtime.CExit;

        // A block ends: its objects are destroyed unless the error is fatal.
        helpers.unwinds = function (error) {
            return error === undefined || error instanceof CppException;
        };

        helpers.throwException = function (address, rtti, dtor) {
            throw new CppException(address, rtti, dtor);
        };

        // A catch clause got an error: a C++ exception or another one to pass on.
        helpers.caught = function (error) {
            if (!(error instanceof CppException))
                throw error;
            error.rethrown = false;
            caughtStack.push(error);
            return error;
        };

        helpers.matches = function (record, rtti) {
            if (record.rtti === rtti)
                return true;
            if (record.rtti.cls !== null && rtti.cls !== null)
                return baseOffset(record.rtti, rtti) >= 0;
            if (record.rtti.pointee !== null && rtti.pointee !== null) {
                if (rtti.pointee.name === 'void' || record.rtti.pointee === rtti.pointee)
                    return true;
                return record.rtti.pointee.cls !== null && rtti.pointee.cls !== null &&
                    baseOffset(record.rtti.pointee, rtti.pointee) === 0;
            }
            if (record.rtti.nullptr && rtti.pointee !== null)
                return true;
            return false;
        };

        // The address of the caught object as the handler's type.
        helpers.adjust = function (record, rtti) {
            if (record.rtti.cls !== null && rtti.cls !== null)
                return record.address + baseOffset(record.rtti, rtti);
            return record.address;
        };

        helpers.endCatch = function (record) {
            var index = caughtStack.lastIndexOf(record);
            if (index >= 0)
                caughtStack.splice(index, 1);
            if (!record.rethrown)
                destroyException(record);
        };

        function destroyException(record) {
            if (record.dtor !== null)
                record.dtor(record.address);
            memory.free(record.address);
        }

        helpers.rethrow = function () {
            if (caughtStack.length === 0)
                throw new CError('terminate called without an active exception', 134);
            var record = caughtStack[caughtStack.length - 1];
            record.rethrown = true;
            throw record;
        };

        helpers.currentException = function () {
            return caughtStack.length > 0 ? caughtStack[caughtStack.length - 1] : null;
        };

        // --- Memory

        helpers.allocate = function (size) {
            var address = memory.malloc(size);
            if (address === 0)
                throw new CError("terminate called after throwing an instance of 'std::bad_alloc'\n" +
                                 '  what():  std::bad_alloc', 134);
            return address;
        };

        helpers.free = function (address) {
            memory.free(address);
        };

        helpers.checkArraySize = function (count) {
            if (count < 0)
                throw new CError("terminate called after throwing an instance of 'std::bad_array_new_length'\n" +
                                 '  what():  std::bad_array_new_length', 134);
        };

        helpers.each = function (base, count, size, initialize) {
            for (var index = 0; index < count; ++index)
                initialize(base + index * size);
        };

        helpers.eachPair = function (target, source, count, size, initialize) {
            for (var index = 0; index < count; ++index)
                initialize(target + index * size, source + index * size);
        };

        helpers.destroyArray = function (base, count, size, dtor) {
            for (var index = count - 1; index >= 0; --index)
                dtor(base + index * size);
        };

        // delete[]: the destructors of the elements (the count is the 8
        // bytes before the array), then the memory.
        helpers.deleteArray = function (pointer, size, dtor) {
            if (pointer === 0)
                return;
            if (size === 0 || dtor === null) {
                memory.free(size === 0 ? pointer : pointer - 8);
                return;
            }
            var count = memory.load64(pointer - 8, true);
            if (typeof count !== 'number')
                count = T.i64.toFloat(count);
            for (var index = count - 1; index >= 0; --index)
                dtor(pointer + index * size);
            memory.free(pointer - 8);
        };

        function vtableOf(address) {
            memory.check(address, 8);
            var vtable = vtables[memory.loadPointer(address)];
            if (vtable === undefined)
                throw new CError('Segmentation fault (invalid vtable pointer)', 139);
            return vtable;
        }

        // delete of a polymorphic object: the destructor from the vtable,
        // then the memory of the whole object.
        helpers.deleteVirtual = function (address, slot) {
            if (address === 0)
                return;
            var vtable = vtableOf(address);
            var full = address + vtable.top;
            memory.functions[vtable[slot]](address);
            memory.free(full);
        };

        // --- RTTI

        helpers.mostDerived = function (address) {
            if (address === 0)
                return 0;
            return address + vtableOf(address).top;
        };

        helpers.dynamicCast = function (address, target) {
            if (address === 0)
                return 0;
            var vtable = vtableOf(address);
            var full = address + vtable.top;
            var offset = baseOffset(vtable.rtti, target);
            return offset < 0 ? 0 : full + offset;
        };

        helpers.dynamicCastReference = function (address, badCast) {
            if (address === 0) {
                if (badCast !== null)
                    badCast();
                throw new CError("terminate called after throwing an instance of 'std::bad_cast'\n" +
                                 '  what():  std::bad_cast', 134);
            }
            return address;
        };

        helpers.typeInfoOf = function (address) {
            if (address === 0)
                throw new CError("terminate called after throwing an instance of 'std::bad_typeid'\n" +
                                 '  what():  std::bad_typeid', 134);
            return session.typeInfoAddress(vtableOf(address).rtti);
        };

        helpers.show = function (type, value) {
            return session.show(type, value, 0);
        };

        return helpers;
    };
})(globalThis);
