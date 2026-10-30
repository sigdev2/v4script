// C#: translation of assignments (through l-values: locals, ref
// parameters, fields, array elements, properties and indexers), compound
// assignment, ++ and --, deconstruction, and conversions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var G = CS.Generator.prototype;
    if (G.lvalue)
        return;

    var J = T.J;

    // A place to read and write: { setup: [expressions], read, write(value) }.
    G.lvalue = function (target) {
        var self = this;
        switch (target.k) {
        case 'local': {
            var local = target.sym;
            var name = J.id(this.localName(local));
            if (local.refKind === 'ref' || local.refKind === 'out' || local.refKind === 'ref readonly') {
                var ref = J.mem(name, 'v');
                return { setup: [], read: ref, write: function (value) { return J.assign(J.mem(name, 'v'), value); } };
            }
            return { setup: [], read: name, write: function (value) { return J.assign(name, value); } };
        }
        case 'field': {
            var field = target.field;
            if (field.isStatic) {
                var holder = this.staticHolder(target.ownerType, field);
                var stableHolder = this.stable(holder);
                return { setup: stableHolder.setup, read: J.mem(stableHolder.ref, field.jsName),
                         write: function (value) { return J.assign(J.mem(stableHolder.ref, field.jsName), value); } };
            }
            var receiver = this.stable(this.receiver(target.receiver));
            return { setup: receiver.setup, read: J.mem(receiver.ref, field.jsName),
                     write: function (value) { return J.assign(J.mem(receiver.ref, field.jsName), value); } };
        }
        case 'arrayElement': {
            if (target.indices.length > 1 || target.array.type.rank > 1) {
                var multi = this.stable(this.expression(target.array));
                var position = this.stable(J.call(this.rt('multiIndex'), [multi.ref, J.arr(target.indices.map(function (index) {
                    return self.indexValue(index);
                }))]));
                var data = J.mem(multi.ref, 'a');
                return { setup: multi.setup.concat(position.setup), read: J.idx(data, position.ref),
                         write: function (value) { return J.assign(J.idx(J.mem(multi.ref, 'a'), position.ref), value); } };
            }
            var array = this.stable(this.expression(target.array));
            var index = this.stable(this.indexValue(target.indices[0]));
            var check = J.call(this.rt('checkIndex'), [array.ref, index.ref]);
            return { setup: array.setup.concat(index.setup).concat([check]), read: J.idx(array.ref, index.ref),
                     write: function (value) { return J.assign(J.idx(array.ref, index.ref), value); } };
        }
        case 'fromEndElement': {
            var fromArray = this.stable(this.expression(target.array));
            var fromIndex = this.stable(J.call(this.rt('fromEndIndex'), [this.expression(target.index), J.mem(fromArray.ref, 'length')]));
            return { setup: fromArray.setup.concat(fromIndex.setup, [J.call(this.rt('checkIndex'), [fromArray.ref, fromIndex.ref])]),
                     read: J.idx(fromArray.ref, fromIndex.ref),
                     write: function (value) { return J.assign(J.idx(fromArray.ref, fromIndex.ref), value); } };
        }
        case 'property':
            return this.propertyLvalue(target);
        case 'this':
            return { setup: [], read: this.thisRef(),
                     write: function (value) { return J.call(self.rt('assignStruct'), [self.thisRef(), value]); } };
        case 'dynamicMember': {
            var object = this.stable(this.expression(target.receiver));
            return { setup: object.setup, read: J.call(this.rt('dynamicGet'), [object.ref, J.str(target.name)]),
                     write: function (value) { return J.call(self.rt('dynamicSet'), [object.ref, J.str(target.name), value]); } };
        }
        case 'dynamicIndex': {
            var indexed = this.stable(this.expression(target.receiver));
            var keys = this.stable(J.arr(target.args.map(function (arg) { return self.expression(arg); })));
            return { setup: indexed.setup.concat(keys.setup), read: J.call(this.rt('dynamicIndex'), [indexed.ref, keys.ref]),
                     write: function (value) { return J.call(self.rt('dynamicSetIndex'), [indexed.ref, keys.ref, value]); } };
        }
        case 'call':
            if (target.method.refReturn) {
                var reference = this.stable(this.expression(target));
                return { setup: reference.setup, read: J.mem(reference.ref, 'v'),
                         write: function (value) { return J.assign(J.mem(reference.ref, 'v'), value); } };
            }
            break;
        case 'conversion':
            return this.lvalue(target.operand);
        }
        throw new Error('C# codegen: not an l-value: ' + target.k);
    };

    // A property or an indexer: the getter and the setter on a receiver
    // evaluated once; a get-only auto-property in its constructor - the field.
    G.propertyLvalue = function (target) {
        var self = this;
        var property = target.property;
        var args = target.args.map(function (arg) { return self.stable(self.argument(arg)); });
        var setup = [];
        args.forEach(function (arg) { setup = setup.concat(arg.setup); });
        var argRefs = args.map(function (arg) { return arg.ref; });
        var holder;
        if (property.isStatic) {
            holder = { setup: [], ref: this.staticHolder(target.ownerType, property) };
        } else {
            holder = this.stable(this.receiver(target.receiver));
        }
        setup = holder.setup.concat(setup);
        if (target.backing || this.isDirectProperty(target)) {
            var field = property.backingField;
            return { setup: setup, read: J.mem(holder.ref, field.jsName),
                     write: function (value) { return J.assign(J.mem(holder.ref, field.jsName), value); } };
        }
        var getter = CS.findGetter(property), setter = CS.findSetter(property);
        var read = getter === null ? J.undef() : this.accessorCall(target, holder.ref, getter, argRefs);
        return {
            setup: setup,
            read: read,
            write: function (value) {
                var stored = self.stable(value);
                return self.withSetup(stored.setup, J.seq([self.accessorCall(target, holder.ref, setter, argRefs.concat([stored.ref])),
                                                           stored.ref]));
            }
        };
    };

    // A call of an accessor on a receiver (base, static, primitive receivers).
    G.accessorCall = function (target, holder, accessor, args) {
        if (target.isBase)
            return J.call(J.mem(J.mem(this.baseProto(accessor), accessor.jsName), 'call'), [this.thisRef()].concat(args));
        if (accessor.isStatic) {
            if (target.ownerType !== null && target.ownerType.kind === 'named' && target.ownerType.args.length > 0 &&
                accessor.owner.allTypeParams.length > 0)
                return J.call(J.mem(J.mem(this.typeSymRef(accessor.owner), accessor.jsName), 'call'), [holder].concat(args));
            return J.call(J.mem(holder, accessor.jsName), args);
        }
        var receiverType = target.receiver !== null ? target.receiver.type : null;
        if (receiverType !== null && receiverType !== undefined && receiverType.kind === 'tparam' &&
            !CS.typeParamIsReference(receiverType.sym))
            return J.call(this.rt('tcall'), [this.typeRef(receiverType), holder, J.str(accessor.jsName), J.arr(args)]);
        return J.call(J.mem(holder, accessor.jsName), args);
    };

    // --- Assignment

    G.expr_assign = function (expr) {
        return this.assignment(expr, true);
    };

    G.assignment = function (expr, valueUsed) {
        return this.assignTo(expr.target, expr.value, valueUsed);
    };

    G.assignTo = function (target, valueExpr, valueUsed) {
        var place = this.lvalue(target);
        var value = this.storedValue(valueExpr);
        if (target.k === 'local' && valueUsed === false)
            return this.withSetup(place.setup, place.write(value));
        return this.withSetup(place.setup, place.write(value));
    };

    G.expr_refAssign = function (expr) {
        var local = expr.target.sym;
        return J.assign(J.id(this.localName(local)), this.reference({ target: expr.value }));
    };

    G.expr_coalesceAssign = function (expr) {
        var place = this.lvalue(expr.target);
        var current = this.temp();
        var assigned = place.write(this.storedValue(expr.value));
        return this.withSetup(place.setup, J.cond(J.bin('!==', J.assign(current, place.read), J.nul()), current, assigned));
    };

    // x op= y: the place once, the operation of the checker on its value,
    // the conversion back.
    G.expr_compoundAssign = function (expr) {
        return this.compoundCode(expr, true);
    };

    G.compoundCode = function (expr, valueUsed) {
        var self = this;
        var place = this.lvalue(expr.target);
        var current = this.stable(place.read);
        var operation;
        this.withPlaceholder('compoundTarget', current.ref, function () {
            operation = self.expression(expr.operation);
        });
        if (expr.back !== null && expr.back !== undefined)
            operation = this.conversionCode(operation, expr.back, expr.operation.type, expr.target.type, expr.checked);
        return this.withSetup(place.setup.concat(current.setup), place.write(operation));
    };

    // ++ and --: the value before or after, wrapped to the type.
    G.expr_increment = function (expr) {
        return this.incrementCode(expr, true);
    };

    G.incrementCode = function (expr, valueUsed) {
        var place = this.lvalue(expr.target);
        // x++ as a value: the old value in a temporary even for a variable.
        var self = this;
        var keep = function (value) {
            if (!valueUsed || expr.prefix)
                return self.stable(value);
            var temp = self.temp();
            return { setup: [J.assign(temp, value)], ref: temp };
        };
        if (expr.kind === 'user') {
            var before = keep(place.read);
            var changed = this.staticCall(expr.ownerType, expr.method, [before.ref]);
            if (expr.prefix || !valueUsed)
                return this.withSetup(place.setup.concat(before.setup), place.write(changed));
            return this.withSetup(place.setup.concat(before.setup), J.seq([place.write(changed), before.ref]));
        }
        if (expr.kind === 'dynamic') {
            var dynamicValue = keep(place.read);
            var next = J.call(this.rt('dynamicBinary'), [J.str(expr.op === '++' ? '+' : '-'), dynamicValue.ref, J.num(1)]);
            return this.withSetup(place.setup.concat(dynamicValue.setup), expr.prefix ? place.write(next) : J.seq([place.write(next), dynamicValue.ref]));
        }
        var kind = expr.kind;
        var op = expr.op === '++' ? '+' : '-';
        var old = keep(place.read);
        var step;
        if (kind === 'decimal')
            step = J.call(J.mem(this.rt('dec'), op === '+' ? 'add' : 'sub'), [old.ref, this.constant(CS.decimal.ONE)]);
        else if (expr.checked && kind !== 'f32' && kind !== 'f64')
            step = J.call(this.rt('checked' + (op === '+' ? 'Add' : 'Sub')), [J.str(kind), old.ref, J.num(1)]);
        else
            step = T.ops.binary(kind, op, old.ref, J.num(1), this.numberContext());
        if (expr.lifted) {
            step = J.cond(J.bin('===', old.ref, J.nul()), J.nul(), step);
        }
        // A local that is only incremented: x = x + 1 | 0.
        if (!valueUsed || expr.prefix)
            return this.withSetup(place.setup.concat(old.setup), place.write(step));
        return this.withSetup(place.setup.concat(old.setup), J.seq([place.write(step), old.ref]));
    };

    // --- Deconstruction

    // (a, b) = value: the parts into temporaries first, then the targets.
    G.expr_deconstruct = function (expr) {
        var value = this.temp();
        var parts = [J.assign(value, this.expression(expr.value))];
        var writes = [];
        this.deconstructInto(expr.targets, value, parts, writes);
        parts = parts.concat(writes);
        parts.push(expr.type.kind === 'void' ? J.undef() : value);
        return J.seq(parts);
    };

    G.deconstructInto = function (target, value, reads, writes) {
        var self = this;
        switch (target.kind) {
        case 'discard':
            return;
        case 'variable': {
            if (target.declares !== undefined)
                this.declareHoisted(target.declares);
            var stored = value;
            if (target.conversion !== undefined && target.conversion !== null) {
                var converted;
                var placeholder = target.conversion;
                converted = this.withPlaceholderValue(placeholder, value);
                stored = converted;
            }
            var place = this.lvalue(target.target);
            writes.push(this.withSetup(place.setup, place.write(stored)));
            return;
        }
        case 'nested': {
            var items = target.items;
            var temps = items.map(function () { return self.temp(); });
            if (target.deconstructor === null) {
                items.forEach(function (item, index) {
                    reads.push(J.assign(temps[index], self.tupleItemRead(value, target.type, index)));
                });
            } else {
                var deconstructor = target.deconstructor;
                var refs = temps.map(function (temp) {
                    return J.call(self.rt('ref'), [J.fn(null, [], [J.ret(temp)]), J.fn(null, ['$v'], [J.expr(J.assign(temp, J.id('$v')))])]);
                });
                var method = deconstructor.method;
                if (deconstructor.extension)
                    reads.push(self.staticCall(deconstructor.owner, method, (deconstructor.typeArgs || []).map(function (arg) {
                        return self.typeRef(arg);
                    }).concat([value]).concat(refs)));
                else
                    reads.push(self.instanceCall({ k: 'placeholder', value: value, type: target.type }, method, refs, deconstructor.owner));
            }
            items.forEach(function (item, index) {
                self.deconstructInto(item, temps[index], reads, writes);
            });
            return;
        }
        }
    };

    // Item1..Item7, then Rest for long tuples.
    G.tupleItemRead = function (tuple, type, index) {
        var value = tuple;
        while (index >= 7) {
            value = J.mem(value, 'Rest');
            index -= 7;
        }
        return J.mem(value, 'Item' + (index + 1));
    };

    // A conversion of a placeholder: the code with the value in its place.
    G.withPlaceholderValue = function (expr, value) {
        if (expr.k === 'placeholder')
            return value;
        if (expr.k === 'conversion' && expr.operand.k === 'placeholder')
            return this.conversionCode(value, expr.conversion, expr.operand.type, expr.type, expr.checked);
        var saved = expr.operand !== undefined ? expr.operand.value : undefined;
        if (expr.operand !== undefined && expr.operand.k === 'placeholder') {
            expr.operand.value = value;
            var result = this.expression(expr);
            expr.operand.value = saved;
            return result;
        }
        return this.expression(expr);
    };

    // --- Conversions

    G.expr_conversion = function (expr) {
        var operand = expr.operand;
        if (operand.k === 'placeholder' && operand.value === undefined && this.placeholders && this.placeholders.conversionValue)
            return this.conversionCode(this.placeholders.conversionValue, expr.conversion, operand.type, expr.type, expr.checked);
        var value = this.expression(operand);
        var conversion = expr.conversion;
        // Boxing copies a struct that comes from a variable.
        if (conversion.kind === 'boxing' && CS.isVariableRead(operand))
            value = this.copyFor(operand, value);
        return this.conversionCode(value, conversion, operand.type, expr.type, expr.checked);
    };

    G.conversionCode = function (value, conversion, from, to, checked) {
        var self = this;
        switch (conversion.kind) {
        case 'identity':
        case 'nullLiteral':
        case 'constant':
            return value;
        case 'numeric':
            return this.numericConversion(value, from, to, checked);
        case 'enum':
            return this.numericConversion(value, CS.isEnum(from) ? from.sym.complete().enumUnderlying : from,
                                          CS.isEnum(to) ? to.sym.complete().enumUnderlying : to, checked);
        case 'nullable': {
            var source = CS.underlyingNullable(from), target = CS.underlyingNullable(to);
            var inner = conversion.inner || { kind: 'identity' };
            if (CS.isNullableValue(from)) {
                var stored = this.stable(value);
                var unwrapped = CS.isNullableValue(to) ? stored.ref : J.call(this.rt('nullableValue'), [stored.ref]);
                if (!CS.isNullableValue(to))
                    return this.withSetup(stored.setup, this.conversionCode(unwrapped, inner, source, target, checked));
                if (inner.kind === 'identity')
                    return value;
                return this.withSetup(stored.setup, J.cond(J.bin('===', stored.ref, J.nul()), J.nul(),
                                                           this.conversionCode(stored.ref, inner, source, target, checked)));
            }
            return this.conversionCode(value, inner, source, target, checked);
        }
        case 'reference':
            if (conversion.checked)
                return J.call(this.rt('castTo'), [this.typeRef(to), value]);
            if (from.kind === 'tparam' && !CS.typeParamIsReference(from.sym))
                return J.call(this.rt('toObject'), [this.typeRef(from), value]);
            return value;
        case 'boxing':
            return this.boxValue(value, from);
        case 'unboxing':
            return this.unboxValue(value, to);
        case 'user': {
            var before = conversion.before && conversion.before.kind !== 'identity'
                ? this.conversionCode(value, conversion.before, from, conversion.paramType, checked) : value;
            var call = this.staticCall(conversion.owner, conversion.method, [before]);
            if (conversion.lifted) {
                var operand = this.stable(value);
                before = conversion.before && conversion.before.kind !== 'identity'
                    ? this.conversionCode(J.call(this.rt('nullableValue'), [operand.ref]), conversion.before, CS.underlyingNullable(from),
                                          conversion.paramType, checked)
                    : operand.ref;
                call = this.staticCall(conversion.owner, conversion.method, [before]);
                return this.withSetup(operand.setup, J.cond(J.bin('===', operand.ref, J.nul()), J.nul(), call));
            }
            if (conversion.after && conversion.after.kind !== 'identity')
                return this.conversionCode(call, conversion.after, conversion.returnType, to, checked);
            return call;
        }
        case 'tuple': {
            var tuple = this.stable(value);
            var sourceTypes = CS.tupleElements(from), targetTypes = CS.tupleElements(to);
            var items = conversion.elements.map(function (element, index) {
                return self.conversionCode(self.tupleItemRead(tuple.ref, from, index), element, sourceTypes[index], targetTypes[index], checked);
            });
            return this.withSetup(tuple.setup, J.cond(J.bin('===', tuple.ref, J.nul()), J.nul(), J.call(this.rt('tuple'), [this.typeRef(to), J.arr(items)])));
        }
        case 'dynamic':
            if (from.kind === 'dynamic')
                return J.call(this.rt('fromDynamic'), [this.typeRef(to), value]);
            return J.call(this.rt('toJs'), [value]);
        }
        throw new Error('C# codegen: unknown conversion ' + conversion.kind);
    };

    // A value type as an object: int, bool and string are their own boxes.
    G.boxValue = function (value, from) {
        if (CS.isSpecial(from, 'int') || CS.isSpecial(from, 'bool') || CS.isSpecial(from, 'string'))
            return value;
        if (from.kind === 'named' && from.sym.kind === 'struct' && from.sym.special === undefined && !CS.isNullableValue(from) &&
            from.args.length === 0)
            return value;
        return J.call(this.rt('box'), [this.typeRef(CS.underlyingNullable(from)), value]);
    };

    G.unboxValue = function (value, to) {
        if (CS.isSpecial(to, 'int'))
            return J.call(this.rt('unboxInt'), [value]);
        return J.call(this.rt('unbox'), [this.typeRef(to), value]);
    };

    // Numeric conversions with the rules of C# on x64: unchecked ones wrap,
    // floats to integers through int or long, decimal by its functions.
    G.numericConversion = function (value, from, to, checked) {
        var source = this.numericKind(from), target = this.numericKind(to);
        if (source === null || target === null || source === target)
            return value;
        var ctx = this.numberContext();
        if (source === 'decimal')
            return J.call(J.mem(this.rt('dec'), 'to_' + target), [value]);
        if (target === 'decimal') {
            if (source === 'f32')
                return J.call(J.mem(this.rt('dec'), 'fromSingle'), [value]);
            if (source === 'f64')
                return J.call(J.mem(this.rt('dec'), 'fromDouble'), [value]);
            if (source === 'u64')
                return J.call(J.mem(this.rt('dec'), 'fromUnsigned'), [value]);
            return J.call(J.mem(this.rt('dec'), 'fromInteger'), [value]);
        }
        if (checked && target !== 'f32' && target !== 'f64')
            return J.call(this.rt('checkedConvert'), [J.str(source), J.str(target), value]);
        if (source === 'f32' || source === 'f64') {
            switch (target) {
            case 'f32':
                return J.call(J.path('Math.fround'), [value]);
            case 'f64':
                return value;
            case 'i32':
                return J.call(this.rt('d2i'), [value]);
            case 'u32':
                return J.call(this.rt('d2u'), [value]);
            case 'i64':
                return J.call(this.rt('d2l'), [value]);
            case 'u64':
                return J.call(this.rt('d2ul'), [value]);
            }
            return T.ops.wrap(target, J.call(this.rt('d2i'), [value]));
        }
        return T.ops.convert(source, target, value, ctx);
    };
})(globalThis);
