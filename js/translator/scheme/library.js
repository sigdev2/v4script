// Scheme: library procedures written in Scheme itself - those that call
// user procedures (map, fold, sort...): so continuations and errors in
// them work as in user code. A definition is translated when its name is
// first mentioned (S.resolveLazy), as a library chunk (the place of an
// error is the user line). Plus format (SRFI 28) and random (SRFI 27).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.LIBRARY_SOURCE)
        return;

    var Pair = S.Pair, NIL = S.NIL, SString = S.SString, Char = S.Char, UNSPEC = S.UNSPEC;
    var def = S.def;
    var check = S.check;

    // --- Library helpers (JavaScript)

    def('%missing?', 1, 1, function (value) { return value === S.NO_MATCH; }, { bool: true });
    def('%any-null?', 1, 1, function (lists) {
        for (; lists instanceof Pair; lists = lists.cdr) {
            if (!(lists.car instanceof Pair))
                return true;
        }
        return false;
    }, { bool: true });
    def('%cars', 1, 1, function (lists) {
        var result = [];
        for (; lists instanceof Pair; lists = lists.cdr)
            result.push(lists.car.car);
        return S.arrayToList(result);
    });
    def('%cdrs', 1, 1, function (lists) {
        var result = [];
        for (; lists instanceof Pair; lists = lists.cdr)
            result.push(lists.car.cdr);
        return S.arrayToList(result);
    });
    // Lists cut to the shortest one.
    def('%truncate', 1, 1, function (lists) {
        var arrays = S.listToArray(lists).map(function (tail) {
            var items = [];
            for (; tail instanceof Pair; tail = tail.cdr)
                items.push(tail.car);
            return items;
        });
        var length = Math.min.apply(null, arrays.map(function (array) { return array.length; }));
        return S.arrayToList(arrays.map(function (array) { return S.arrayToList(array.slice(0, length)); }));
    });
    // A character predicate from a character, a string (a set of characters) or a procedure.
    def('%char-matcher', 2, 2, function (name, pattern) {
        if (typeof pattern === 'function')
            return pattern;
        if (pattern instanceof Char)
            return S.directProc('char=?', 1, function (value) { return value === pattern; });
        if (pattern instanceof SString) {
            var codes = pattern.codes();
            return S.directProc('char-in-set?', 1, function (value) {
                return value instanceof Char && codes.indexOf(value.code) >= 0;
            });
        }
        throw S.error(name.name + ': not a character, string or predicate', [pattern]);
    });
    def('reverse-list->string', 1, 1, function (list) {
        var items = check.list('reverse-list->string', list);
        return S.str(items.reverse().map(function (item) {
            return String.fromCodePoint(check.character('reverse-list->string', item).code);
        }).join(''));
    });

    // --- format (SRFI 28 and ~d ~x ~o ~b): (format string values...) or
    // (format #t string ...) - to current-output-port, (format #f ...) - a string.
    def('format', 1, -1, function (first) {
        var args = Array.prototype.slice.call(arguments);
        var destination = null;
        if (typeof first === 'boolean' || first instanceof S.Port)
            destination = args.shift();
        var template = check.string('format', args.shift()).s;
        var out = '';
        var next = 0;
        for (var index = 0; index < template.length; ++index) {
            var character = template.charAt(index);
            if (character !== '~') {
                out += character;
                continue;
            }
            var directive = template.charAt(++index).toLowerCase();
            switch (directive) {
            case 'a':
            case 's':
            case 'd':
            case 'x':
            case 'o':
            case 'b': {
                if (next >= args.length)
                    throw S.error('format: not enough arguments for ~' + directive, [S.str(template)]);
                var value = args[next++];
                if (directive === 'a')
                    out += S.write(value, 'display');
                else if (directive === 's')
                    out += S.write(value, 'write');
                else
                    out += S.N.numberToString(S.N.checkNumber('format', value), { d: 10, x: 16, o: 8, b: 2 }[directive]);
                break;
            }
            case '%':
            case 'n':
                out += '\n';
                break;
            case '~':
                out += '~';
                break;
            default:
                throw S.error('format: unknown directive ~' + directive, [S.str(template)]);
            }
        }
        if (destination === null || destination === false)
            return S.str(out);
        var port = destination === true ? S.prims['current-output-port'].fn() : destination;
        S.outputPort('format', port, false).write(out);
        return UNSPEC;
    });

    // --- Random numbers (SRFI 27 and (random n))

    function randomBelow(name, bound) {
        if (S.N.isExactInteger(bound)) {
            if (S.N.sign(bound) <= 0)
                throw S.error(name + ': not a positive integer', [bound]);
            if (typeof bound === 'number')
                return Math.floor(Math.random() * bound);
            // A big one: 24 bits at a time, the excess is dropped by division with a remainder.
            var bits = T.big.bitLength(bound) + 16;
            var value = 0;
            for (var collected = 0; collected < bits; collected += 24)
                value = T.big.add(T.big.mul(value, 16777216), Math.floor(Math.random() * 16777216));
            return T.big.mod(value, bound);
        }
        var limit = S.N.fv(S.N.checkReal(name, bound));
        return S.N.flo(Math.random() * limit);
    }
    def('random-integer', 1, 1, function (bound) { return randomBelow('random-integer', bound); });
    def('random-real', 0, 0, function () {
        var value;
        do {
            value = Math.random();
        } while (value === 0);
        return S.N.flo(value);
    });
    def('random', 1, 1, function (bound) { return randomBelow('random', bound); });

    // --- Definitions in Scheme
    //
    // No backslashes: the text is a JavaScript string.

    S.LIBRARY_SOURCE = [
        // R7RS: map, for-each and their kin
        '(define (map f l . ls)',
        '  (if (null? ls)',
        '      (let loop ((l l) (acc (quote ())))',
        '        (if (pair? l) (loop (cdr l) (cons (f (car l)) acc)) (reverse acc)))',
        '      (let loop ((ls (cons l ls)) (acc (quote ())))',
        '        (if (%any-null? ls) (reverse acc) (loop (%cdrs ls) (cons (apply f (%cars ls)) acc))))))',
        '(define (for-each f l . ls)',
        '  (if (null? ls)',
        '      (let loop ((l l)) (if (pair? l) (begin (f (car l)) (loop (cdr l)))))',
        '      (let loop ((ls (cons l ls)))',
        '        (if (not (%any-null? ls)) (begin (apply f (%cars ls)) (loop (%cdrs ls)))))))',
        '(define map-in-order map)',
        '(define map! map)',
        '(define (vector-map f v . vs)',
        '  (if (null? vs)',
        '      (let ((n (vector-length v)))',
        '        (let loop ((i 0) (acc (quote ())))',
        '          (if (< i n) (loop (+ i 1) (cons (f (vector-ref v i)) acc)) (list->vector (reverse acc)))))',
        '      (list->vector (apply map f (map vector->list (cons v vs))))))',
        '(define (vector-for-each f v . vs)',
        '  (if (null? vs)',
        '      (let ((n (vector-length v)))',
        '        (let loop ((i 0)) (if (< i n) (begin (f (vector-ref v i)) (loop (+ i 1))))))',
        '      (apply for-each f (map vector->list (cons v vs)))))',
        '(define (%string-range s rest)',
        '  (if (and (pair? rest) (not (string? (car rest))))',
        '      (cons (car rest) (if (pair? (cdr rest)) (cadr rest) (string-length s)))',
        '      #f))',
        '(define (string-for-each f s . rest)',
        '  (let ((range (%string-range s rest)))',
        '    (if (or range (null? rest))',
        '        (let ((end (if range (cdr range) (string-length s))))',
        '          (let loop ((i (if range (car range) 0)))',
        '            (if (< i end) (begin (f (string-ref s i)) (loop (+ i 1))))))',
        '        (apply for-each f (map string->list (cons s rest))))))',
        '(define (string-map f s . rest)',
        '  (let ((range (%string-range s rest)))',
        '    (if (or range (null? rest))',
        '        (let ((end (if range (cdr range) (string-length s))))',
        '          (let loop ((i (if range (car range) 0)) (acc (quote ())))',
        '            (if (< i end) (loop (+ i 1) (cons (f (string-ref s i)) acc)) (list->string (reverse acc)))))',
        '        (list->string (apply map f (map string->list (cons s rest)))))))',
        '(define (string-map! f s . rest)',
        '  (let* ((range (or (%string-range s rest) (cons 0 (string-length s)))))',
        '    (let loop ((i (car range)))',
        '      (if (< i (cdr range)) (begin (string-set! s i (f (string-ref s i))) (loop (+ i 1)))))))',
        '(define (member x l . compare)',
        '  (if (null? compare) (%member x l)',
        '      (let ((same? (car compare)))',
        '        (let loop ((l l)) (cond ((not (pair? l)) #f) ((same? x (car l)) l) (else (loop (cdr l))))))))',
        '(define (assoc x l . compare)',
        '  (if (null? compare) (%assoc x l)',
        '      (let ((same? (car compare)))',
        '        (let loop ((l l)) (cond ((not (pair? l)) #f) ((same? x (car (car l))) (car l)) (else (loop (cdr l))))))))',

        // SRFI 1
        '(define (list-tabulate n f)',
        '  (let loop ((i (- n 1)) (acc (quote ()))) (if (< i 0) acc (loop (- i 1) (cons (f i) acc)))))',
        '(define (fold kons knil lst . lsts)',
        '  (if (null? lsts)',
        '      (let loop ((l lst) (acc knil)) (if (pair? l) (loop (cdr l) (kons (car l) acc)) acc))',
        '      (let loop ((ls (cons lst lsts)) (acc knil))',
        '        (if (%any-null? ls) acc (loop (%cdrs ls) (apply kons (append (%cars ls) (list acc))))))))',
        '(define (fold-right kons knil lst . lsts)',
        '  (if (null? lsts)',
        '      (let loop ((l (reverse lst)) (acc knil)) (if (pair? l) (loop (cdr l) (kons (car l) acc)) acc))',
        '      (let loop ((ls (map reverse (%truncate (cons lst lsts)))) (acc knil))',
        '        (if (%any-null? ls) acc (loop (%cdrs ls) (apply kons (append (%cars ls) (list acc))))))))',
        '(define (fold-left kons knil lst . lsts)',
        '  (if (null? lsts)',
        '      (let loop ((l lst) (acc knil)) (if (pair? l) (loop (cdr l) (kons acc (car l))) acc))',
        '      (let loop ((ls (cons lst lsts)) (acc knil))',
        '        (if (%any-null? ls) acc (loop (%cdrs ls) (apply kons acc (%cars ls)))))))',
        '(define (pair-fold kons knil lst)',
        '  (let loop ((l lst) (acc knil)) (if (pair? l) (let ((next (cdr l))) (loop next (kons l acc))) acc)))',
        '(define (pair-fold-right kons knil lst)',
        '  (let loop ((l lst)) (if (pair? l) (kons l (loop (cdr l))) knil)))',
        '(define (reduce f ridentity lst) (if (null? lst) ridentity (fold f (car lst) (cdr lst))))',
        '(define (reduce-right f ridentity lst)',
        '  (if (null? lst) ridentity (let ((r (reverse lst))) (fold f (car r) (cdr r)))))',
        '(define (unfold stop? mapper successor seed . tail-gen)',
        '  (let loop ((seed seed) (acc (quote ())))',
        '    (if (stop? seed)',
        '        (append-reverse acc (if (pair? tail-gen) ((car tail-gen) seed) (quote ())))',
        '        (loop (successor seed) (cons (mapper seed) acc)))))',
        '(define (unfold-right stop? mapper successor seed . tail)',
        '  (let loop ((seed seed) (acc (if (pair? tail) (car tail) (quote ()))))',
        '    (if (stop? seed) acc (loop (successor seed) (cons (mapper seed) acc)))))',
        '(define (append-map f l . ls) (apply append (apply map f l ls)))',
        '(define append-map! append-map)',
        '(define (filter-map f l . ls)',
        '  (let loop ((rest (apply map f l ls)) (acc (quote ())))',
        '    (cond ((null? rest) (reverse acc)) ((car rest) (loop (cdr rest) (cons (car rest) acc))) (else (loop (cdr rest) acc)))))',
        '(define (pair-for-each f l) (let loop ((l l)) (if (pair? l) (let ((next (cdr l))) (f l) (loop next)))))',
        '(define (filter pred l)',
        '  (let loop ((l l) (acc (quote ())))',
        '    (cond ((null? l) (reverse acc)) ((pred (car l)) (loop (cdr l) (cons (car l) acc))) (else (loop (cdr l) acc)))))',
        '(define (remove pred l) (filter (lambda (x) (not (pred x))) l))',
        '(define (partition pred l)',
        '  (let loop ((l l) (yes (quote ())) (no (quote ())))',
        '    (cond ((null? l) (values (reverse yes) (reverse no)))',
        '          ((pred (car l)) (loop (cdr l) (cons (car l) yes) no))',
        '          (else (loop (cdr l) yes (cons (car l) no))))))',
        '(define filter! filter)',
        '(define remove! remove)',
        '(define partition! partition)',
        '(define (find pred l) (let ((tail (find-tail pred l))) (and tail (car tail))))',
        '(define (find-tail pred l)',
        '  (let loop ((l l)) (cond ((not (pair? l)) #f) ((pred (car l)) l) (else (loop (cdr l))))))',
        '(define (any pred l . ls)',
        '  (if (null? ls)',
        '      (let loop ((l l)) (cond ((not (pair? l)) #f) ((null? (cdr l)) (pred (car l))) ((pred (car l)) => (lambda (x) x)) (else (loop (cdr l)))))',
        '      (let loop ((ls (cons l ls)))',
        '        (if (%any-null? ls) #f (or (apply pred (%cars ls)) (loop (%cdrs ls)))))))',
        '(define (every pred l . ls)',
        '  (if (null? ls)',
        '      (let loop ((l l) (last #t))',
        '        (if (not (pair? l)) last (let ((r (pred (car l)))) (if r (loop (cdr l) r) #f))))',
        '      (let loop ((ls (cons l ls)) (last #t))',
        '        (if (%any-null? ls) last (let ((r (apply pred (%cars ls)))) (if r (loop (%cdrs ls) r) #f))))))',
        '(define (list-index pred l . ls)',
        '  (let loop ((ls (cons l ls)) (i 0))',
        '    (cond ((%any-null? ls) #f) ((apply pred (%cars ls)) i) (else (loop (%cdrs ls) (+ i 1))))))',
        '(define (count pred l . ls)',
        '  (let loop ((ls (cons l ls)) (n 0))',
        '    (if (%any-null? ls) n (loop (%cdrs ls) (if (apply pred (%cars ls)) (+ n 1) n)))))',
        '(define (take-while pred l)',
        '  (let loop ((l l) (acc (quote ())))',
        '    (if (and (pair? l) (pred (car l))) (loop (cdr l) (cons (car l) acc)) (reverse acc))))',
        '(define take-while! take-while)',
        '(define (drop-while pred l) (let loop ((l l)) (if (and (pair? l) (pred (car l))) (loop (cdr l)) l)))',
        '(define (span pred l) (values (take-while pred l) (drop-while pred l)))',
        '(define (break pred l) (span (lambda (x) (not (pred x))) l))',
        '(define span! span)',
        '(define break! break)',
        '(define (delete x l . compare)',
        '  (if (null? compare) (%delete x l)',
        '      (let ((same? (car compare))) (filter (lambda (y) (not (same? x y))) l))))',
        '(define delete! delete)',
        '(define (delete-duplicates l . compare)',
        '  (if (null? compare) (%delete-duplicates l)',
        '      (let ((same? (car compare)))',
        '        (let loop ((l l) (acc (quote ())))',
        '          (cond ((null? l) (reverse acc))',
        '                ((any (lambda (y) (same? y (car l))) acc) (loop (cdr l) acc))',
        '                (else (loop (cdr l) (cons (car l) acc))))))))',
        '(define delete-duplicates! delete-duplicates)',
        '(define (alist-delete key alist . compare)',
        '  (let ((same? (if (pair? compare) (car compare) equal?)))',
        '    (filter (lambda (entry) (not (same? key (car entry)))) alist)))',
        '(define alist-delete! alist-delete)',
        '(define (list= same? . lists)',
        '  (or (null? lists) (null? (cdr lists))',
        '      (and (let loop ((a (car lists)) (b (cadr lists)))',
        '             (cond ((and (null? a) (null? b)) #t)',
        '                   ((or (null? a) (null? b)) #f)',
        '                   (else (and (same? (car a) (car b)) (loop (cdr a) (cdr b))))))',
        '           (apply list= same? (cdr lists)))))',
        '(define (lset-adjoin same? l . elts)',
        '  (fold (lambda (x acc) (if (member x acc (lambda (a b) (same? b a))) acc (cons x acc))) l elts))',
        '(define (lset-union same? . lists)',
        '  (if (null? lists) (quote ())',
        '      (fold (lambda (l acc) (fold (lambda (x acc) (if (member x acc (lambda (a b) (same? b a))) acc (cons x acc))) acc l))',
        '            (car lists) (cdr lists))))',
        '(define (lset-intersection same? l . lists)',
        '  (filter (lambda (x) (every (lambda (other) (member x other same?)) lists)) l))',
        '(define (lset-difference same? l . lists)',
        '  (filter (lambda (x) (not (any (lambda (other) (member x other same?)) lists))) l))',
        '(define (lset-xor same? . lists)',
        '  (fold (lambda (b a) (append (lset-difference same? a b) (lset-difference same? b a))) (quote ()) lists))',
        '(define (lset<= same? . lists)',
        '  (or (null? lists) (null? (cdr lists))',
        '      (and (every (lambda (x) (member x (cadr lists) same?)) (car lists)) (apply lset<= same? (cdr lists)))))',
        '(define (lset= same? . lists)',
        '  (or (null? lists) (null? (cdr lists))',
        '      (and (apply lset<= same? (car lists) (cadr lists) (quote ()))',
        '           (lset<= same? (cadr lists) (car lists))',
        '           (apply lset= same? (cdr lists)))))',

        // Sorting (SRFI 95 sort, SRFI 132 list-sort / vector-sort), stable
        '(define (%merge-lists a b less?)',
        '  (let loop ((a a) (b b) (acc (quote ())))',
        '    (cond ((null? a) (append-reverse acc b))',
        '          ((null? b) (append-reverse acc a))',
        '          ((less? (car b) (car a)) (loop a (cdr b) (cons (car b) acc)))',
        '          (else (loop (cdr a) b (cons (car a) acc))))))',
        '(define (%sort-list l less?)',
        '  (let sort ((l l) (n (length l)))',
        '    (cond ((= n 0) (quote ()))',
        '          ((= n 1) (list (car l)))',
        '          (else (let ((half (quotient n 2)))',
        '                  (%merge-lists (sort l half) (sort (list-tail l half) (- n half)) less?))))))',
        '(define (sort seq less?)',
        '  (cond ((procedure? seq) (sort less? seq))',
        '        ((vector? seq) (list->vector (%sort-list (vector->list seq) less?)))',
        '        (else (%sort-list seq less?))))',
        '(define (sort! seq less?)',
        '  (cond ((procedure? seq) (sort! less? seq))',
        '        ((vector? seq) (let ((sorted (%sort-list (vector->list seq) less?))) (vector-copy! seq 0 (list->vector sorted)) seq))',
        '        (else (%sort-list seq less?))))',
        '(define (list-sort less? l) (if (procedure? l) (%sort-list less? l) (%sort-list l less?)))',
        '(define list-sort! list-sort)',
        '(define (vector-sort less? v . range)',
        '  (if (procedure? v) (apply vector-sort v less? range)',
        '      (let ((start (if (pair? range) (car range) 0)) (end (if (and (pair? range) (pair? (cdr range))) (cadr range) (vector-length v))))',
        '        (list->vector (%sort-list (vector->list v start end) less?)))))',
        '(define (vector-sort! v less? . range)',
        '  (if (procedure? v) (apply vector-sort! less? v range)',
        '      (let ((start (if (pair? range) (car range) 0)) (end (if (and (pair? range) (pair? (cdr range))) (cadr range) (vector-length v))))',
        '        (vector-copy! v start (list->vector (%sort-list (vector->list v start end) less?))))))',
        '(define (merge a b less?) (if (procedure? a) (%merge-lists b less? a) (%merge-lists a b less?)))',
        '(define merge! merge)',
        '(define (sorted? seq less?)',
        '  (let loop ((l (if (vector? seq) (vector->list seq) seq)))',
        '    (or (not (pair? l)) (null? (cdr l)) (and (not (less? (cadr l) (car l))) (loop (cdr l))))))',

        // SRFI 13: procedures with character predicates
        '(define (%index s pred start end step)',
        '  (let loop ((i (if (> step 0) start (- end 1))))',
        '    (cond ((or (< i start) (>= i end)) #f) ((pred (string-ref s i)) i) (else (loop (+ i step))))))',
        '(define (%bounds s rest) (values (if (pair? rest) (car rest) 0) (if (and (pair? rest) (pair? (cdr rest))) (cadr rest) (string-length s))))',
        '(define (string-index s x . rest)',
        '  (call-with-values (lambda () (%bounds s rest)) (lambda (start end) (%index s (%char-matcher (quote string-index) x) start end 1))))',
        '(define (string-index-right s x . rest)',
        '  (call-with-values (lambda () (%bounds s rest)) (lambda (start end) (%index s (%char-matcher (quote string-index-right) x) start end -1))))',
        '(define string-rindex string-index-right)',
        '(define (string-skip s x . rest)',
        '  (let ((pred (%char-matcher (quote string-skip) x)))',
        '    (call-with-values (lambda () (%bounds s rest)) (lambda (start end) (%index s (lambda (c) (not (pred c))) start end 1)))))',
        '(define (string-skip-right s x . rest)',
        '  (let ((pred (%char-matcher (quote string-skip-right) x)))',
        '    (call-with-values (lambda () (%bounds s rest)) (lambda (start end) (%index s (lambda (c) (not (pred c))) start end -1)))))',
        '(define (string-count s x . rest)',
        '  (let ((pred (%char-matcher (quote string-count) x)))',
        '    (call-with-values (lambda () (%bounds s rest))',
        '      (lambda (start end) (let loop ((i start) (n 0)) (if (< i end) (loop (+ i 1) (if (pred (string-ref s i)) (+ n 1) n)) n))))))',
        '(define (string-every x s . rest)',
        '  (let ((pred (%char-matcher (quote string-every) x)))',
        '    (call-with-values (lambda () (%bounds s rest))',
        '      (lambda (start end) (let loop ((i start) (last #t)) (if (< i end) (let ((r (pred (string-ref s i)))) (and r (loop (+ i 1) r))) last))))))',
        '(define (string-any x s . rest)',
        '  (let ((pred (%char-matcher (quote string-any) x)))',
        '    (call-with-values (lambda () (%bounds s rest))',
        '      (lambda (start end) (let loop ((i start)) (and (< i end) (or (pred (string-ref s i)) (loop (+ i 1)))))))))',
        '(define (string-tabulate f n)',
        '  (let loop ((i (- n 1)) (acc (quote ()))) (if (< i 0) (list->string acc) (loop (- i 1) (cons (f i) acc)))))',
        '(define (%string-filter keep? name a b rest)',
        '  (let* ((s (if (string? a) a b)) (pred (%char-matcher name (if (string? a) b a))))',
        '    (call-with-values (lambda () (%bounds s rest))',
        '      (lambda (start end)',
        '        (let loop ((i (- end 1)) (acc (quote ())))',
        '          (if (< i start) (list->string acc)',
        '              (loop (- i 1) (if (eq? (not (pred (string-ref s i))) (not keep?)) (cons (string-ref s i) acc) acc))))))))',
        '(define (string-filter a b . rest) (%string-filter #t (quote string-filter) a b rest))',
        '(define (string-delete a b . rest) (%string-filter #f (quote string-delete) a b rest))',
        '(define (string-remove a b . rest) (%string-filter #f (quote string-remove) a b rest))',
        '(define (string-fold kons knil s . rest)',
        '  (call-with-values (lambda () (%bounds s rest))',
        '    (lambda (start end) (let loop ((i start) (acc knil)) (if (< i end) (loop (+ i 1) (kons (string-ref s i) acc)) acc)))))',
        '(define (string-fold-right kons knil s . rest)',
        '  (call-with-values (lambda () (%bounds s rest))',
        '    (lambda (start end) (let loop ((i (- end 1)) (acc knil)) (if (>= i start) (loop (- i 1) (kons (string-ref s i) acc)) acc)))))',
        '(define (string-unfold stop? mapper successor seed . rest)',
        '  (let loop ((seed seed) (acc (quote ())))',
        '    (if (stop? seed)',
        '        (string-append (if (pair? rest) (car rest) "") (list->string (reverse acc))',
        '                       (if (and (pair? rest) (pair? (cdr rest))) ((cadr rest) seed) ""))',
        '        (loop (successor seed) (cons (mapper seed) acc)))))',
        '(define (string-unfold-right stop? mapper successor seed . rest)',
        '  (let loop ((seed seed) (acc (quote ())))',
        '    (if (stop? seed)',
        '        (string-append (if (and (pair? rest) (pair? (cdr rest))) ((cadr rest) seed) "") (list->string acc)',
        '                       (if (pair? rest) (car rest) ""))',
        '        (loop (successor seed) (cons (mapper seed) acc)))))',
        '(define (%trim-pred rest) (if (and (pair? rest) (not (number? (car rest)))) (%char-matcher (quote string-trim) (car rest)) char-whitespace?))',
        '(define (%trim-range rest) (if (and (pair? rest) (not (number? (car rest)))) (cdr rest) rest))',
        '(define (string-trim s . rest)',
        '  (let ((pred (%trim-pred rest)))',
        '    (call-with-values (lambda () (%bounds s (%trim-range rest)))',
        '      (lambda (start end) (let loop ((i start)) (if (and (< i end) (pred (string-ref s i))) (loop (+ i 1)) (substring s i end)))))))',
        '(define (string-trim-right s . rest)',
        '  (let ((pred (%trim-pred rest)))',
        '    (call-with-values (lambda () (%bounds s (%trim-range rest)))',
        '      (lambda (start end) (let loop ((i end)) (if (and (> i start) (pred (string-ref s (- i 1)))) (loop (- i 1)) (substring s start i)))))))',
        '(define (string-trim-both s . rest)',
        '  (let ((pred (%trim-pred rest)))',
        '    (call-with-values (lambda () (%bounds s (%trim-range rest)))',
        '      (lambda (start end)',
        '        (let left ((i start))',
        '          (if (and (< i end) (pred (string-ref s i))) (left (+ i 1))',
        '              (let right ((j end)) (if (and (> j i) (pred (string-ref s (- j 1)))) (right (- j 1)) (substring s i j)))))))))',
        '(define (string-tokenize s . rest)',
        '  (let ((token? (if (and (pair? rest) (not (number? (car rest)))) (%char-matcher (quote string-tokenize) (car rest))',
        '                    (lambda (c) (not (char-whitespace? c))))))',
        '    (call-with-values (lambda () (%bounds s (%trim-range rest)))',
        '      (lambda (start end)',
        '        (let loop ((i start) (from #f) (acc (quote ())))',
        '          (cond ((>= i end) (reverse (if from (cons (substring s from end) acc) acc)))',
        '                ((token? (string-ref s i)) (loop (+ i 1) (or from i) acc))',
        '                (from (loop (+ i 1) #f (cons (substring s from i) acc)))',
        '                (else (loop (+ i 1) #f acc))))))))',

        // SRFI 69: procedures with procedure arguments
        '(define (hash-table-ref table key . rest)',
        '  (let ((value (%hash-table-ref table key)))',
        '    (cond ((not (%missing? value)) (if (and (pair? rest) (pair? (cdr rest))) ((cadr rest) value) value))',
        '          ((pair? rest) ((car rest)))',
        '          (else (error "hash-table-ref: key not found" key)))))',
        '(define (hash-table-update! table key proc . rest)',
        '  (hash-table-set! table key (proc (apply hash-table-ref table key rest))))',
        '(define (hash-table-update!/default table key proc default)',
        '  (hash-table-set! table key (proc (hash-table-ref/default table key default))))',
        '(define (hash-table-walk table proc)',
        '  (for-each (lambda (entry) (proc (car entry) (cdr entry))) (hash-table->alist table)))',
        '(define hash-table-for-each hash-table-walk)',
        '(define (hash-table-fold table kons knil)',
        '  (fold (lambda (entry acc) (kons (car entry) (cdr entry) acc)) knil (hash-table->alist table)))'
    ].join('\n');
})(globalThis);
