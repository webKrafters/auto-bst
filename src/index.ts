export type DEFAULT_CONSTANT = "__DEFAULT__";

export type Criterion<T = unknown> = (
    value : T,
    node : TreeNode<T>, 
    tree : Tree<T>
) => boolean;

export type NodeInternals = "index" | "isDetached" | "left" | "right" | "root" | "tree";

export type NodeInternalTokensMap = { [ K in NodeInternals ]: number };

export const enum Transition {
    COMPLETE = 0,
    DETACHING = -1,
    DISASSOCIATING = 2, 
    JOINING = 1
};

export type Subscriber = ( ...args : Array<unknown> ) => void;

/* Unsub function which resolves to true when subscriber found, and false otherwise */
export type UnsubscribeFn = () => boolean;

export const enum TraversalDirection {
    LEFT = 'RTL',
    RIGHT = 'LTR'
};

export const enum TraversalOrder {
    IN = 'IN_ORDER',
    POST = 'POST_ORDER',
    PRE = 'PRE_ORDER'
};

export interface TraversalOptions {
    direction? : TraversalDirection; //  determines LTR (left-to-right) vs RTL (right-to-left) traversal. Defaults to 'LTR'.
    maxLength? : number; // traverses at-most this number of items from the start index toward a defined direction in the defined order. It accepts any integer between 0 and tree size. Negative integer is coerced to 0. Integer exceeding tree size is coerced to tree.size.
    order? : TraversalOrder; // determine the order of traversal. Defaults to `TraversalOrder.IN` traversal.
    start? : number; // starts traversal from this index. Index may also accept negative integer which is resolved backward from the end. This value when resolving to a negative is coerced to 0 and coerced to `tree size - 1` when exceeding tree size.
};

export interface CriteriaOptions<T = unknown> {
    isSameValue? : Criterion<T> | DEFAULT_CONSTANT;
    isValueBefore? : Criterion<T> | DEFAULT_CONSTANT;
};

export interface TreeOptions<T = unknown> extends CriteriaOptions<T>{}

const CLEANUP_EVENTNAME = 'cleanup';

const EMPTY_OBJ = Object.freeze({});

const NODE_INTERNALS : Readonly<Array<NodeInternals>> = Object.freeze([
    'index', 'isDetached', 'left', 'right', 'root', 'tree'
]);

const nodeAccessMap = new WeakMap<TreeNode, NodeInternalTokensMap>();

class Publisher {
    private _subscriptionMapRef = new WeakRef<{
        [eventName: string]: Set<Subscriber>
    }>({});

    private get _subsMap() { return this._subscriptionMapRef?.deref() }

    cleanup() {
        try {
            for( const evtName in this._subsMap ) {
                this._subsMap[ evtName ] = null;
            }
        } catch( e ) {
            /* istanbul ignore next */
            if( !( e instanceof ReferenceError ) ) { throw e }
        } finally {
            return this;
        }
    }

    publish(
        eventName : string,
        ...args : Array<unknown>
    ) {
        this._subsMap?.[ eventName ]?.forEach( fn => fn( ...args ) );
        return this;
    }

    subscribe(
        eventName : string,
        subscriber : Subscriber
    ) : UnsubscribeFn{
        try {
            if( !this._subsMap[ eventName ] ) {
                this._subsMap[ eventName ] = new Set();
            }
            this._subsMap[ eventName ].add( subscriber );
            return () => this._subsMap?.[ eventName ]?.delete( subscriber );
        } catch( e ) { 
            /* istanbul ignore next */
            if( !( e instanceof ReferenceError ) ) { throw e }
        }
    }
}

export class TreeNode<T = unknown> {
    private _index : number;
    private _isDetached : boolean = false;
    private _left : TreeNode<T> = null;
    private _right : TreeNode<T> = null;
    private _root : TreeNode<T> = null;
    private _transition : Transition = Transition.COMPLETE;
    private _treeRef : WeakRef<Tree<T>> = null;
    private _unsubTreeCleanup : UnsubscribeFn = null;
    private _value : T;

    static dynammicAccessorOpts = {
        configurable: true,
        enumerable: false
    };

	static isValid<V> ( node : TreeNode<V> ) { return node instanceof TreeNode }

	/* istanbul ignore next */
    constructor( tree : Tree<T>, value? : T, index? : number ) {
        const iTokensMap = registerNodeInternalsFor( this );
        const  ctx = this;
        Object.defineProperty( ctx, iTokensMap.index, {
            set( index : number ) { ctx._index = index },
            ...TreeNode.dynammicAccessorOpts
        });
        Object.defineProperty( ctx, iTokensMap.left, {
            set( node : TreeNode<T> = null ) {
                ctx._left = node;
                if( node ) { node[ nodeAccessMap.get( node ).root ] = this }
            },
            ...TreeNode.dynammicAccessorOpts
        });
        Object.defineProperty( ctx, iTokensMap.right, {
            set( node : TreeNode<T> = null ) {
                ctx._right = node;
                if( node ) { node[ nodeAccessMap.get( node ).root ] = this }
            },
            ...TreeNode.dynammicAccessorOpts
        });
        Object.defineProperty( ctx, iTokensMap.root, {
            set( node : TreeNode<T> = null ) {
                if( node !== ctx._root ) { ctx._root = node }
            },
            ...TreeNode.dynammicAccessorOpts
        });
        this._index = index;
        this._treeRef = new WeakRef( tree );
        this._value = value;
        this.constructor = undefined;
	}

    /** @readonly */
    get children() {
        const children = [];
        this.left && children.push( this.left );
        this.right && children.push( this.right );
        return children;
    }
    
    /**
     * left-to-right InOrder positioning index when this node was lastly an accessible part of its tree. If this node's isDetached flag is false, then this value is the current index of this node in the order as described.
     * @readonly
     */
    get index() { return this._index }
    
    /**
     * is set if this node is currently not an accessible part of its tree
     * @readonly
     */
    get isDetached() { return this._isDetached }

    /**
     * this node's current transition mode.
     * @readonly
     */
    get transition() { return this._transition }
    
    /**
     * is set if this node is not part of any valid tree
     * @readonly
     */
    get isFree() { return !Tree.isValid( this.tree ) }

    /** @readonly */
	get left(){
        this.tree?.rotate();
        return this._left;
    }

	/** @readonly */
	get right(){
        this.tree?.rotate();
        return this._right;
     }

	/** @readonly */
	get root() {
        this.tree.rotate();
        return this._root;
    }

    get tree(){ return this._treeRef?.deref() }

	get value(){ return this._value }
	
    set tree( tree : Tree<T> ){
        if( typeof tree === 'undefined' || tree === null ) {
            throw new TypeError( 'Cannot direclty unset a node\'s tree property. Please use the `node.free()` method to properly disassociate it from its tree.' );
        } 
        if( !Tree.isValid( tree ) ) {
            throw new TypeError( 'Cannot attach a node to an invalid tree.' );
        }
        const currentTree = this.tree;
        if( tree === currentTree ) { return }
        currentTree && this.free();
        this._treeRef = new WeakRef( tree );
        this.join();
    }

	set value( value ){
        if( this._value === value ) { return }
        this._value = value;
        this.tree?.synchronize( this );
    }

    /**
     * Detach self from current tree
     * @throws {Error} On attempt to detach self from a tree while in the process of joining a tree
     */
    detach() {
        if( this._isDetached ) { return this }
        this._transition = Transition.DETACHING;
        this._remove();
        this._unsubTreeCleanup = this.tree?.onCleanup(() => this.free());
        this._transition = Transition.COMPLETE;
        return this;
    }

    /** completely dissociate self from its tree */
    free() {
        if( this.isFree ) { return this }
        this._transition = Transition.DISASSOCIATING;
        if( !this.tree.isDisposing ) {
            !this._isDetached && this._remove();
            this._stopTreeCleanupWatch();
        }
        this._treeRef = null;
        this._isDetached = true; // always ensure that a freed node's detached flag is set. 
        this._transition = Transition.COMPLETE;
        return this;
    }

    /**
     * @param {number} [nGenerations] ancestor position in proximity to this TreeNode. eg TreeNode.root has nGenerations = 1.
     * @returns {Generator<TreeNode<T>>} parent nodes up the tree until `nGenerations` ancestors reached or tree height exhausted
     */
    *genAncestors(
        nGenerations : number = Number.POSITIVE_INFINITY
    ) : Generator<TreeNode<T>> {
        this.tree?.rotate();
        for( let parent = this.root, i = 0; i < nGenerations && parent !== null; i++, parent = parent.root ) {
            yield parent;
        }
    }

    /**
     * @param {number} [nGenerations] descendants sorted in asc order starting left -> right
     * @returns {Generator<TreeNode<T>>} descendant nodes down the tree until `nGenerations` descendants reached or tree depth exhausted
     */
    *genDescendants(
        nGenerations : number = Number.POSITIVE_INFINITY
    ) : Generator<TreeNode<T>> {
        this.tree?.rotate();
        yield* genDescendantsFrom( this, nGenerations );
    }

    /** @returns {Generator<TreeNode<T>>} parent nodes up the tree until `anscestorNode`. Returns empty array if `ancestorNode` not found in the hierarchy */
    *genParentsUntil( ancestorNode? : TreeNode<T> ) {
        this.tree?.rotate();
        for( let parent = this.root; parent !== null; parent = parent.root ) {
            yield parent;
            if( parent === ancestorNode ) { break }
        }
    }

    /**
     * @param {number} [nGenerations] ancestor position in proximity to this TreeNode. eg TreeNode.root has nGenerations = 1.
     * @returns {Array<TreeNode<T>>} parent nodes up the tree until `nGenerations` ancestors reached or tree height exhausted
     */
    getAncestors(
        nGenerations : number = Number.POSITIVE_INFINITY
    ) : Array<TreeNode<T>> {
        return [ ...this.genAncestors( nGenerations ) ];
    }

    /**
     * @param {number} [nGenerations] descendants sorted in asc order starting left -> right
     * @returns {Array<TreeNode<T>>} descendant nodes down the tree until `nGenerations` descendants reached or tree depth exhausted
     */
    getDescendants(
        nGenerations : number = Number.POSITIVE_INFINITY
    ) : Array<TreeNode<T>> {
        return [ ...genDescendantsFrom( this, nGenerations ) ];
    }

    /** @returns {Array<TreeNode<T>>} parent nodes up the tree until `anscestorNode`. Returns empty array if `ancestorNode` not found in the hierarchy */
    getParentsUntil( ancestorNode? : TreeNode<T> ) : Array<TreeNode<T>> {
        return [ ...this.genParentsUntil( ancestorNode ) ];
    }

    /**
     * Joins self to current tree
     * 
     * @throws {ReferenceError} For non-existent tree property
     * @throws {Error} On attempt to join a tree while detaching from a tree
     */
    join() {
        if( !this._isDetached ) { return this }
        const tree = this.tree;
        if( !tree ) {
            this._isDetached = true;
            throw new ReferenceError( 'Cannot join node. Referenced tree does not exist.' );
        }
        this._transition = Transition.JOINING;
        tree.insertNode( this );
        this._stopTreeCleanupWatch();
        this._isDetached = false; 
        this._transition = Transition.COMPLETE;
        return this;
    }

    private _remove() {
        this.tree?.removeNode( this );
        this._isDetached = true;
    }

    private _stopTreeCleanupWatch() {
        if( !this._unsubTreeCleanup ) { return }
        this._unsubTreeCleanup();
        this._unsubTreeCleanup = null;
    }
}

class Tree<T = unknown> {

    static DEFAULT : DEFAULT_CONSTANT = '__DEFAULT__';

    static INVALID_NODE_MESSAGE = 'Invalid node type detected.';

    static TREE_MISMATCH_MESSAGE = 'Cannot perform this operation on a node which does not belong to this tree.';

    static isValid<T>( tree : Tree<T> ) { return tree instanceof Tree }

    private _autoRotateTimer : NodeJS.Timeout = null;
    private _isBalanced = true;
    private _isDisposing = false;
    private _isSameValue : CriteriaOptions<T>["isSameValue"];
    private _isValueBefore : CriteriaOptions<T>["isValueBefore"];
    /** These are currently accessible nodes*/
    private _nodes : Array<TreeNode<T>> = [];
    private _publisher = new Publisher();
    private _root : TreeNode<T> = null;

	/** Note: `options.isSameValue` config property uses `Object.is()` equality check out of the box */
	constructor(
        values : Iterable<T> = [],
        options : TreeOptions<T> = EMPTY_OBJ
    ) {
        this.criteria = {
            isSameValue: options?.isSameValue,
            isValueBefore: options?.isValueBefore
        };
        this._isDisposing = false;
        this.values = values;
    } 

    /** @readonly */
	get isDisposing() { return this._isDisposing }
    get isSameValue() { return this._isSameValue }
    get isValueBefore() { return this._isValueBefore }
    get size(){ return this._nodes.length }
    /** specifically an array of values encased in non-detached nodes of this tree */
    get values() { return this._nodes.map(({ value }) => value ) }

    /**
     * sets both `isSameValue` and `isValueBefore` propeties simultaneously.
     * omitted properties are ignored.
     * properties set to undefined are replaced with the default matching criteria.
     * set to undefined to reset both `isSameValue` and `isValueBefore` properties to their internal default functions.
     */
    set criteria( criteria : CriteriaOptions<T> ) {
        const {
            isSameValue = Tree.DEFAULT,
            isValueBefore = Tree.DEFAULT
        } = criteria ?? ( EMPTY_OBJ as CriteriaOptions<T> );
        if( this._isSameValue !== isSameValue && validateCriterion(
            isSameValue as Criterion<T>, 'isSameValue'
        ) ) { this._isSameValue = isSameValue }
        if( this._isValueBefore !== isValueBefore && validateCriterion(
            isValueBefore as Criterion<T>, 'isValueBefore'
        ) ) { this._isValueBefore = isValueBefore }
        this._refresh();
    }

	/** setting this property to undefined or Tree.DEFAULT will reset it to default */
	set isSameValue( isSameValue : CriteriaOptions<T>["isSameValue"] ){
        this.criteria = { isSameValue: isSameValue ?? Tree.DEFAULT };
    }
	/** setting this property to undefined or Tree.DEFAULT will reset it to default */
	set isValueBefore( isValueBefore : CriteriaOptions<T>["isValueBefore"] ){
        this.criteria = { isValueBefore: isValueBefore ?? Tree.DEFAULT };
    }
    /**
     * setting this property to undefined will reset it. Alias: `this.clear()`
     * 
     * @throws {TypeError} for non-iterable input
     */
	set values( _values : Iterable<T> ) {
        let nodes : Array<TreeNode<T>> = [];
        if( !_values ) { _values = [] };
        try {
            for( const v of [ ..._values ] ) { nodes.push( new TreeNode<T>( this, v ) ) }
        } catch( e ) {
            /* istanbul ignore next */
            if( e.constructor.name === 'TypeError' && e.message === '_values is not iterable' ) {
                throw new TypeError( 'Can only set values property using an iterable or (falsy values for an empty tree).' );
            }
            /* istanbul ignore next */
            throw e;
        }
        if( !nodes.length ) {
            this._nodes.length &&
            this._empty()._scheduleRotation( 0 );
            return; 
        }
        nodes = nodes.sort(({ value }, node ) => this.compare( value, node ));
        let node = nodes.shift();
        node[ nodeAccessMap.get( node ).index ] = 0;
        const uniqueNodes = [ node ];
        let hasSameValues = this.size !== 0 && this._equalsNodeVal(
            uniqueNodes[ 0 ].value, this._nodes[ 0 ]
        );
        let uLen;
        while( nodes.length ) {
            uLen = uniqueNodes.length;
            node = nodes.shift();
            if( !this._equalsNodeVal( node.value, uniqueNodes[ uLen - 1 ] ) ) {
                node[ nodeAccessMap.get( node ).index ] = uLen;
                uniqueNodes.push( node );
                /* istanbul ignore next */
                if( hasSameValues && ( uLen === this.size || !this._equalsNodeVal(
                    node.value,
                    this._nodes[ uLen ]
                ) ) ) {
                    hasSameValues = false;
                }
            }
        }
        /* istanbul ignore next */
        if( hasSameValues ) { return }
        this._empty();
        this._nodes = uniqueNodes;
        this._scheduleRotation();
    }

    /**
     * Call this before deleting your tree instance to ensure immediate release
     * of any longer-living nodes (i.e. detached nodes) and resources
     */
    cleanup() {
        this._isDisposing = true;
        this._publisher.publish( CLEANUP_EVENTNAME ).cleanup();
        this._isDisposing = false;
        return this;
    }

    /** discards all active nodes */
    clear() {
        this.values = undefined;
        return this;
    }

    /** @throws {TypeError} Invoid node argument type */
    compare( value : T, node : TreeNode<T> ) {
        throwOnInvalidNode( node );
        return this._equalsNodeVal( value, node )
            ? 0
            : this._isLessThanNodeVal( value, node )
                ? -1
                : 1;
    }

    /**
     * @throws {Error} Invalid argument values
     * @throws {TypeError} Invalid argument types
     * @see TraversalOptions
     */
    *genTraversal(
        options : TraversalOptions = EMPTY_OBJ
    ) : Generator<TreeNode<T>> {
        this.rotate();
        if( this._root === null ) { return }
        const len = this._nodes.length;
        let {
            direction = TraversalDirection.RIGHT,
            maxLength = undefined,
            order = TraversalOrder.IN,
            start = undefined
        } = options;
        if( direction !== TraversalDirection.LEFT && direction !== TraversalDirection.RIGHT ) {
            throw new Error( 'Invalid `direction` option supplied to `traverse` method. A member of `TraversalDirection` expected or leave it unset.' );
        }
        if( typeof maxLength !== 'undefined' && !isNumber( maxLength ) ) {
            throw new TypeError( 'Invalid `maxLength` option supplied to `traverse` method. Integer expected or leave it unset.' );
        }
        /* istanbul ignore else */
        if( maxLength === 0  ) { return }
        if( isNumber( start ) ) {
            if( start < 0 ) { start = len + start }
            if( start < 0 || start >= len ) { start = undefined }
        } else if( typeof start !== 'undefined' ) {
            throw new TypeError( 'Invalid `start node index` option supplied to `traverse` method. Integer expected or leave it unset.' );
        }
        const nodes = this._nodes;
        switch( order ) {
            case TraversalOrder.IN: {
                maxLength = maxLength ?? len;
                if( direction === TraversalDirection.RIGHT ) {
                    start = start ?? 0;
                    let end = start + maxLength;
                    if( end > len ) { end = len };
                    for( let i = start; i < end; i++ ) { yield nodes[ i ] }
                    break;
                }
                start = start ?? nodes.length - 1;
                let end = start - maxLength;
                end = ( end < 0 ? 0 : end ) - 1;
                for( let i = start; i > end; i-- ) { yield nodes[ i ] }
                break;
            }
            case TraversalOrder.POST: yield* this._genPostOrder( direction, maxLength, nodes[ start ] ); break;
            case TraversalOrder.PRE: yield* this._genPreOrder( direction, maxLength, nodes[ start ] );
            break;
            default: throw new Error( 'Unknown order detected. Member of the `TraversalOrder` expected or leave it unset.' );
        }
    }

    /**
     * Returns node located at index using a left-to-right in-order traversal
     * @param {number} index - index can be negative index number to count from the end
     */
    getNodeAt( index : number ) { return this._nodes[ index < 0 ? this._nodes.length + index : index ] }

    /**
     * @param {number} [start] - negative integer accepted to caunt from the end. 
     * @param {number} [end] - negative integer accepted to caunt from the end.
     */
    indexOf(
        value : T,
        start : number = 0,
        end : number = this.size - 1
    ) : number {
        let last = this._nodes.length - 1;
        if( last === -1 || start > last ) { return -1 }
        if( start < 0 ) {
            start = last + start + 1;
            if( start < 0 ) { start = 0 }
        }
        if( end > last ) {
            end = last;
        } else {
            if( end < 0 ) { end = last + end + 1 }
            if( end <= start ) {
                return this.compare( value, this._nodes[ start ] ) === 0
                    ? start
                    : -1
            }
        }
        let mid, node;
        do {
            mid = Math.floor( ( start + end ) / 2 );
            node = this._nodes[ mid ];
            switch( this.compare( value, node ) ) {
                case -1: end = mid - 1; break;
                case 1: start = mid + 1; break;
                default: return node.index;
            }
        } while( start <= end );
        return -1;
    }
    
    insert( value : T ) {
        const iIndex = this._findInsertionIndex( value );
        return iIndex !== -1
            ? this._insertNodeAt( new TreeNode<T>( this, value, iIndex ), iIndex )
            : this;
    }
    
    /**
     * @throws {TypeError} For attempting to insert an invalid node.
     * @throws {ReferenceError} For attempting to insert a node into an unassociated tree.
     */
    insertNode( node : TreeNode<T> ) {
        throwOnInvalidNode( node );
        if( node.isFree ) {
            node.tree = this;
            return this;
        }
        throwOnNodeTreeMismatch( this, node );
        if( !node.isDetached ) { return this }
        if( node.transition !== Transition.JOINING ) {
            node.join();
            return this;
        }
        return this._insertNodeAt( node, this._findInsertionIndex( node.value ) );
    }

    /** Listen to this tree's cleanup event. */
    onCleanup( subscriber : Subscriber ) : UnsubscribeFn {
        return this._publisher.subscribe( CLEANUP_EVENTNAME, subscriber );
    }
    
    remove( value : T ) {
        if( !this.size ) { return this }
        const deleteIndex = this.indexOf( value );
        deleteIndex !== -1 && this._nodes[ deleteIndex ].free();
        return this;
    }

    /**
     * @throws {TypeError} For attempting to remove an invalid node.
     * @throws {ReferenceError} For attempting to remove a node from a tree it does not belong.
     */
    removeNode( node : TreeNode<T> ) {
        throwOnInvalidNode( node );
        throwOnNodeTreeMismatch( this, node );
        if( node.transition !== Transition.DETACHING &&
            node.transition !== Transition.DISASSOCIATING
        ) {
            node.free();
            return this;
        }
        return this._updateNodeAt( node.index );
    }

    rotate() {
        if( this._isBalanced ) { return this }
        clearTimeout( this._autoRotateTimer );
        this._root = this._makeRotation();
        this._isBalanced = true;
        return this;
    };

    /**
     * Ensures that changes in node value are balanced
     * 
     * @throws {TypeError} For attempting to synchronize an invalid node.
     * @throws {ReferenceError} For attempting to synchronize a node into a tree it does not belong.
     */
    synchronize( node : TreeNode<T> ) {
        throwOnInvalidNode( node );
        throwOnNodeTreeMismatch( this, node );
        if( node.isDetached ) { return this }
        const { index: oldIndex } = node;
        this._nodes.splice( oldIndex, 1 );
        const iIndex = this._findInsertionIndex( node.value );
        if( iIndex === -1 ) { return this }
        if( iIndex === oldIndex ) {
            this._nodes.splice( oldIndex, 0, node );
            return this;
        }
        this._nodes.splice( iIndex, 0, node );
        for( let [ i, n ] = iIndex < oldIndex ? [ iIndex, oldIndex ] : [ oldIndex, iIndex ]; i <= n; i++ ) {
            node = this._nodes[ i ];
            node[ nodeAccessMap.get( node ).index ] = i;
        }
        return this._scheduleRotation();
    }

    /**
     * @return {void|Array<TreeNode<T>>} Returms TreeNodes if no `cb` param  and `void` if `cb` param 
     * @throws {Error} Invalid argument values
     * @throws {TypeError} Invalid argument types
     * @see TraversalOptions
     */
    traverse(
        cb? : ( node : TreeNode<T> ) => void,
        options? : TraversalOptions
    ) : void|Array<TreeNode<T>> {
        let nodes : Array<TreeNode<T>>;
        if( typeof cb === 'undefined' ) {
            nodes = [];
            cb = n => { nodes.push( n ) };
        }
        if( typeof cb !== 'function' ) {
            throw new TypeError( 'Invalid `cb` argument supplied to `traverse` method. Void function expected' );
        }
        this.rotate();
        const gen = this.genTraversal( options );
        for( let it = gen.next(); !it.done; it = gen.next() ) { cb( it.value ) }
        return nodes;
    }

    protected _empty() {
        const nodes = this._nodes;
        do {
            const node = nodes.pop();
            if( !node ) { break }
            node.free();
        } while( true );
        return this;
    }
    
    protected _findInsertionIndex( value : T ) : number {
        if( !this._nodes.length ) { return 0 }
        let start = 0;
        let end = this._nodes.length - 1;
        let mid, node;
        do {
            mid = Math.floor( ( start + end ) / 2 );
            node = this._nodes[ mid ];
            switch( this.compare( value, node ) ) {
                case -1: { 
                    if( mid === 0 ) { return 0 }
                    const compPrevVal = this.compare( value, this._nodes[ mid - 1 ] );
                    if( compPrevVal === 1 ) { return mid }
                    if( compPrevVal === 0 ) { return -1 }
                    end = mid - 1;
                    break;
                }
                case 1: {
                    if( mid === this._nodes.length - 1 ) { return this._nodes.length }
                    const compNextVal = this.compare( value, this._nodes[ mid + 1 ] );
                    if( compNextVal === -1 ) { return mid + 1 }
                    if( compNextVal === 0 ) { return -1 }
                    start = mid + 1;
                    break;
                }
                default: return -1;
            }
        } while( true );
    }

    protected *_genPostOrder(
        direction : TraversalDirection = TraversalDirection.RIGHT,
        traversalLength : number = undefined,
        startNode : TreeNode<T> = undefined
    ) : Generator<TreeNode<T>, void> {
        direction === TraversalDirection.RIGHT
            ? yield* this._ltrPostOrder( startNode, traversalLength )
            : yield* this._rtlPostOrder( startNode, traversalLength )
    }

    protected *_genPreOrder(
        direction : TraversalDirection = TraversalDirection.RIGHT,
        traversalLength : number = null,
        startNode : TreeNode<T> = null
    ) :  Generator<TreeNode<T>, void> {
        direction === TraversalDirection.RIGHT
            ? yield* this._ltrPreOrder( startNode, traversalLength )
            : yield* this._rtlPreOrder( startNode, traversalLength )
    }

    protected _insertNodeAt(
        node : TreeNode<T>,
        insertionIndex : number = null
    ) {
        /* istanbul ignore next */
        if( insertionIndex === -1 ) { return this }
        /* istanbul ignore else */
        if( node.index !== insertionIndex ) {
            node[ nodeAccessMap.get( node ).index ] = insertionIndex;
        }
        return this._updateNodeAt( insertionIndex, node );
    }

    /**
     * @param {number} [start] start rotation at this index
     * @param {number} [end] end rotation at this index
     * @returns {TreeNode<T>} tree/subtree root
     */
    protected _makeRotation(
        start : number = 0,
        end : number = this._nodes.length - 1
    ) : TreeNode<T> {
        if( start > end ) { return null }
        const mid = Math.floor( ( start + end ) / 2 );
        const root = this._nodes[ mid ];
        /* istanbul ignore else */
        if( root ) {
            root[ nodeAccessMap.get( root ).left ] = this._makeRotation( start, mid - 1 );
            root[ nodeAccessMap.get( root ).right ] = this._makeRotation( mid + 1, end );
        }
        return root;
    }

    private _equalsNodeVal( value : T, node : TreeNode<T> ) {
        return this._isSameValue === Tree.DEFAULT
            ? isSameValueDefaultFn( value, node, this )
            : this._isSameValue( value, node, this );
    }

    private _isLessThanNodeVal( value : T, node : TreeNode<T> ) {
        return this._isValueBefore === Tree.DEFAULT
            ? isValueBeforeDefaultFn( value, node, this )
            : this._isValueBefore( value, node, this );
    }

    private *_ltrPostOrder(
        startNode : TreeNode<T> = this._nodes[ 0 ],
        traversalLength : number = this._nodes.length,
        visited : { count : number } = { count: 0 },
        isChild : boolean = false
    ) : Generator<TreeNode<T>, void> {
        if( !startNode || visited.count === traversalLength ) { return }
        if( !visited.count ) {
            visited.count++;
            yield startNode;
            if( startNode === startNode.root?.right ) {
                /* istanbul ignore else */
                if( visited.count < traversalLength ) {
                    visited.count++;
                    yield startNode.root;
                }
                return yield* this._ltrPostOrder( startNode.root?.root, traversalLength, visited );
            }
            return yield* this._ltrPostOrder( startNode.root, traversalLength, visited );
        }
        if( isChild ) {
            yield* this._ltrPostOrder( startNode.left, traversalLength, visited, true );
            yield* this._ltrPostOrder( startNode.right, traversalLength, visited, true );
            if( visited.count === traversalLength ) { return }
            visited.count++;
            return yield startNode;
        }
        yield* this._ltrPostOrder( startNode.right, traversalLength, visited, true );
        if( visited.count < traversalLength ) {
            visited.count++;
            yield startNode;
        }
        yield* this._ltrPostOrder( startNode.root, traversalLength, visited );
    };

    private *_ltrPreOrder(
        startNode : TreeNode<T> = null,
        traversalLength : number = null,
        visited : { count : number } = { count: 0 },
        root : TreeNode<T> = this._root
    ) : Generator<TreeNode<T>, void> {
        if( !root || (
            traversalLength && visited.count === traversalLength
        ) ) {   return  }
        if( !startNode || visited.count || startNode === root ) {
            visited.count++;
            yield root;
        }
        yield* this._ltrPreOrder( startNode, traversalLength, visited, root.left );
        yield* this._ltrPreOrder( startNode, traversalLength, visited, root.right );
    }

    protected _refresh() {
        if( !this.size ) { return this }
        const values = this.values;
        this.clear();
        this.values = values;
        return this;
    }

    private *_rtlPostOrder(
        startNode : TreeNode<T> = this._nodes[ this._nodes.length - 1 ],
        traversalLength : number = this._nodes.length,
        visited : { count : number } = { count: 0 },
        isChild : boolean = false
    ) : Generator<TreeNode<T>, void> {
        if( !startNode || visited.count === traversalLength ) { return }
        if( !visited.count ) {
            visited.count++;
            yield startNode;
            /* istanbul ignore else */
            if( startNode === startNode.root?.left ) {
                /* istanbul ignore else */
                if( visited.count < traversalLength ) {
                    visited.count++;
                    yield startNode.root;
                }
                return yield* this._rtlPostOrder( startNode.root?.root, traversalLength, visited );
            }
            return yield* this._rtlPostOrder( startNode.root, traversalLength, visited );
        }
        if( isChild ) {
            yield* this._rtlPostOrder( startNode.right, traversalLength, visited, true );
            yield* this._rtlPostOrder( startNode.left, traversalLength, visited, true );
            /* istanbul ignore next */
            if( visited.count === traversalLength ) { return }
            visited.count++;
            return yield startNode;
        }
        yield* this._rtlPostOrder( startNode.left, traversalLength, visited, true );
        /* istanbul ignore else */
        if( visited.count < traversalLength ) {
            visited.count++;
            yield startNode;
        }
        yield* this._rtlPostOrder( startNode.root, traversalLength, visited );
    }

    private *_rtlPreOrder(
        startNode : TreeNode<T> = null,
        traversalLength : number = null,
        visited : { count : number } = { count: 0 },
        root : TreeNode<T> = this._root
    ) : Generator<TreeNode<T>, void> {
        if( !root || (
            traversalLength && visited.count === traversalLength
        ) ) {   return  }
        if( !startNode || visited.count || startNode === root ) {
            visited.count++;
            yield root;
        }
        yield* this._rtlPreOrder( startNode, traversalLength, visited, root.right );
        yield* this._rtlPreOrder( startNode, traversalLength, visited, root.left );
    }

    protected _scheduleRotation( delay : number = 3e4 ) {
        if( !this._isBalanced ) { return this }
        this._isBalanced = false;
        this._autoRotateTimer = setTimeout( () => this.rotate(), delay );
        return this;
    }

    /** @param [newNode] - Inserts into index when newNode present. Otherwise, removes node at index. */
    protected _updateNodeAt( index : number, newNode? : TreeNode<T> ) {
        const nodes = this._nodes;
        newNode
            ? nodes.splice( index, 0, newNode )
            : nodes.splice( index, 1 );
        for( let i = index, nLen = nodes.length; i < nLen; i++ ) {
            const node =  nodes[ i ];
            node[ nodeAccessMap.get( node ).index ] = i;
        }
        return this._scheduleRotation();
    }
}


const isSameValueDefaultFn : Criterion<unknown> = ( value, node ) => Object.is( value, node.value );

/**
 * Checks if a value is less than the current node's value.
 * Note: uses '>' for string and number values and returns false for the rest.
 */
const isValueBeforeDefaultFn : Criterion<unknown> = ( value, node ) => {
    return isString( value ) || isNumber( value )
        ? value < node.value
        : false;
}

/**
 * @param node - ancestor node
 * @param nGenerations - how many generations of descendants to collect
 * @param [isDescendant = false] - is the `node` parameter a descendant of a prior visited node?
 */
function* genDescendantsFrom<T>(
    node : TreeNode<T>,
    nGenerations : number,
    isDescendant :boolean  = false
) : Generator<TreeNode<T>> {
    if( node === null || nGenerations === 0 ) { return }
    yield* genDescendantsFrom( node.left, nGenerations - 1, true );
    if( isDescendant ) { yield node }
    yield* genDescendantsFrom( node.right, nGenerations - 1, true );
}

function registerNodeInternalsFor<T>( node : TreeNode<T> ) {
    const internals = {} as NodeInternalTokensMap;
    internals_construct: {
        const visited = {} as Array<string>;
        let i = 0;
        let done = false;
        do {
            for( const token of `${ Math.random() }`.slice( 2 ) ) {
                if( token in visited ) { continue }
                internals[ NODE_INTERNALS[ i ] ] = +token;
                i++;
                visited[ token ] = null;
                if( i === NODE_INTERNALS.length ) {
                    done = true;
                    break;
                }
            }
        } while( !done );
    }
    return nodeAccessMap
        .set( node, internals )
        .get( node );
}

/** @throws {TypeError} on invalid node type */
function throwOnInvalidNode<T>( node : TreeNode<T> ) {
    if( !TreeNode.isValid( node ) ) {
       throw new TypeError( Tree.INVALID_NODE_MESSAGE );
    }
}

/** @throws {ReferenceError} on invalid node type */
function throwOnNodeTreeMismatch<T>(
    currentTree : Tree<T>,
    node : TreeNode<T>
) {
    if( node.tree !== currentTree ) {
        throw new ReferenceError( Tree.TREE_MISMATCH_MESSAGE );
    }
}

function isNumber<V>( v : V ){ return isType( v, 'number', Number ) }

function isString<V>( v : V ){ return isType( v, 'string', String ) }

function isType<V>(
    value : V,
    typeName : string = 'object',
    constructor? : Function
) {
    if( value === null ) { return false }
    const _type = typeof value;
    return _type === 'object' && typeof constructor !== 'undefined'
        ? value[ 'constructor' ] === constructor
        : _type === typeName;
}

/** @throws {TypeError} */
function validateCriterion<T>( criterion : Criterion<T>, criterionName : string ) : boolean;
function validateCriterion<T>( criterion : keyof CriteriaOptions<T>, criterionName : string ) : boolean;
function validateCriterion<T>( criterion, criterionName ) : boolean {
    if( criterion !== Tree.DEFAULT && typeof criterion !== 'function' ) {
        throw new TypeError( `Invalid attempt to set tree\'s "${ criterionName }" property. Either unset it or set to either a function or Tree.DEFAULT.` );
    }
    return true;
}

export default Tree;
