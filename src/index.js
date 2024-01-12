/** @typedef {"__DEFAULT__"} DEFAULT_CONSTANT */

/**
 * @callback Criterion
 * @param {T} value
 * @param {TreeNode<T>} node
 * @param {Tree<T>} tree
 * @returns {boolean} 
 * @template [T]
 */

/** @typedef {"index"|"left"|"right"|"root"} NodeInternals */

/** @typedef {{[K in NodeInternals]: number}} NodeInternalTokensMap */

/**
 * @typedef NodeTransition
 * @property {0} NodeTransition.COMPLETE
 * @property {-1} NodeTransition.DETACHING
 * @property {2} NodeTransition.DISASSOCIATING
 * @property {1} NodeTransition.JOINING
 */

/**
 * @callback PostOrderTraversal
 * @param {TreeNode<T>} [startNode]
 * @param {number} [traversalLength]
 * @param {{count: number}} [visited]
 * @param {boolean} [isChild]
 * @returns {Generator<TreeNode<T, void>}
 * @template [T]
 */

/**
 * @callback PreOrderTraversal
 * @param {TreeNode<T>} [startNode]
 * @param {number} [traversalLength]
 * @param {{count: number}} [visited]
 * @param {TreeNode<T>} [root]
 * @returns {Generator<TreeNode<T>, void>}
 * @template [T]
 */

/**
 * @callback Subscriber
 * @param {...*} args
 * @returns {void}
 */

/**
 * @typedef TraversalDirection
 * @property {'LTR'} TraversalDirection.RIGHT
 * @property {'RTL'} TraversalDirection.LEFT
 */

/**
 * @typedef TraversalOrder
 * @property {'IN_ORDER'} TraversalOrder.IN
 * @property {'POST_ORDER'} TraversalOrder.POST
 * @property {'PRE_ORDER'} TraversalOrder.PRE
 */

/**
 * @typedef {Object} TraversalOptions
 * @property {TraversalDirection[keyof TraversalDirection]} [TraversalOptions.direction=TraversalDirection["RIGHT"]] determines LTR (left-to-right) vs RTL (right-to-left) traversal. Defaults to 'LTR'.
 * @property {number} [TraversalOptions.maxLength] traverses at-most this number of items from the start index toward a defined direction in the defined order. It accepts any integer between 0 and tree size. Negative integer is coerced to 0. Integer exceeding tree size is coerced to tree.size.
 * @property {TraversalOrder[keyof TraversalOrder]} [TraversalOptions.order=TraversalOrder["IN"]] determine the order of traversal. Defaults to `TraversalOrder.IN` traversal.
 * @property {number} [TraversalOptions.start=0] starts traversal from this index. Index may also accept negative integer which is resolved backward from the end. This value when resolving to a negative is coerced to 0 and coerced to `tree size - 1` when exceeding tree size.
 */

/**
 * @callback TraversalStrategy
 * @param {TraversalDirection[keyof TraversalDirection]} direction
 * @param {number} traversalLength 
 * @param {TreeNode<T>} startNode
 * @returns {Generator<TreeNode<T>, void>} 
 * @template [T]
 */

/**
 * @typedef {{
 *  isSameValue?: Criterion<T>,
 *  isValueBefore?: Criterion<T>
 * }} TreeOptions
 * @template [T]
 */

/**
 * @callback UnsubscribeFn
 * @return {boolean} Unsub function which resolves to true when subscriber found, and false otherwise
 */

const CLEANUP_EVENTNAME = 'cleanup';

const EMPTY_OBJ = Object.freeze({});

/** @type {Readonly<NodeInternals>} */
const NODE_INTERNALS = Object.freeze([ 'index', 'isDetached', 'left', 'right', 'root', 'tree', ]);

/**
 * @type {WeakMap<TreeNode<T>, NodeInternalTokensMap>}
 * @template [T]
 */
const nodeAccessMap = new WeakMap();

class Publisher {
    
    /** @type {WeakRef<{[eventName: string]: Set<Subscriber>}>} */
    #subscriptionMapRef = new WeakRef({});

    get #subsMap() { return this.#subscriptionMapRef?.deref() }

    cleanup() {
        try {
            for( const evtName in this.#subsMap ) { this.#subsMap[ evtName ] = null }
        } catch( e ) {
            /* istanbul ignore next */
            if( !( e instanceof ReferenceError ) ) { throw e }
        } finally {
            return this;
        }
    }

    /**
     * @param {string} eventName 
     * @param {...*} [args]
     */
    publish( eventName, ...args ) {
        this.#subsMap?.[ eventName ]?.forEach( fn => fn( ...args ) );
        return this;
    }

    /**
     * @param {string} eventName 
     * @param {Subscriber} subscriber
     * @returns {UnsubscribeFn}
     */
    subscribe( eventName, subscriber ) {
        try {
            if( !this.#subsMap[ eventName ] ) {
                this.#subsMap[ eventName ] = new Set();
            }
            this.#subsMap[ eventName ].add( subscriber );
            return () => this.#subsMap?.[ eventName ]?.delete( subscriber );
        } catch( e ) { 
            /* istanbul ignore next */
            if( !( e instanceof ReferenceError ) ) { throw e }
        }
    }
}

/**
 * @class
 * @template [T]
 */
class TreeNode {
    /** @type {number} */ #index;
    /** @type {boolean} */ #isDetached = false;
    /** @type {TreeNode<T>} */ #left = null;
    /** @type {TreeNode<T>} */ #right = null;
    /** @type {TreeNode<T>} */ #root = null;
    /** @type {NodeTransition[ keyof NodeTransition]} */
    #transition = TreeNode.Transition.COMPLETE;
    /** @type {WeakRef<Tree<T>>} */ #treeRef = null;
    /** @type {UnsubscribeFn} */ #unsubTreeCleanup = null;
    /** @type {T} */ #value;

    /** @type {Readonly<NodeTransition>} */
    static Transition = Object.freeze({
        COMPLETE: 0,
        DETACHING: -1,
        DISASSOCIATING: 2,
        JOINING: 1
    });

	/**
	 * @static
	 * @param {TreeNode<T>} node
     * @template [T]
	 */
    static isValid ( node ) { return node instanceof TreeNode }

	/**
	 * @constructor
     * @param {Tree<T>} tree
	 * @param {T} [value]
     * @param {number} [index]
	 */
	/* istanbul ignore next */
    constructor( tree, value = undefined, index = undefined ) {
        const iTokensMap = registerNodeInternalsFor( this );
        this.__defineSetter__( iTokensMap.index, function ( index ) { this.#index = index } );
        /* istanbul ignore next */
        this.__defineSetter__( iTokensMap.left, function ( node = null ) {
            this.#left = node;
            if( node ) { node[ nodeAccessMap.get( node ).root ] = this }
        } );
        /* istanbul ignore next */
        this.__defineSetter__( iTokensMap.right, function ( node = null ) {
            this.#right = node;
            if( node ) { node[ nodeAccessMap.get( node ).root ] = this }
        } );
        /* istanbul ignore next */
        this.__defineSetter__( iTokensMap.root, function ( node = null ) {
            /* istanbul ignore else */
            if( node !== this.#root ) { this.#root = node }
        } );
        this.#index = index;
        this.#treeRef = new WeakRef( tree );
        this.#value = value;
        this.constructor = undefined;
	}

    /** @readonly */
    get children() {
        const children = [];
        this.#left && children.push( this.#left );
        this.#right && children.push( this.#right );
        return children;
    }
    
    /**
     * left-to-right InOrder positioning index when this node was lastly an accessible part of its tree. If this node's isDetached flag is false, then this value is the current index of this node in the order as described.
     * @readonly
     */
    get index() { return this.#index }
    
    /**
     * is set if this node is currently not an accessible part of its tree
     * @readonly
     */
    get isDetached() { return this.#isDetached }

    /**
     * this node's current transition mode.
     * @readonly
     */
    get transition() { return this.#transition }
    
    /**
     * is set if this node is not part of any valid tree
     * @readonly
     */
    get isFree() { return !Tree.isValid( this.tree ) }

    /** @readonly */
	get left(){ return this.#left }

	/** @readonly */
	get right(){ return this.#right }

	/** @readonly */
	get root() { return this.#root }

    get tree(){ return this.#treeRef?.deref() }

	get value(){ return this.#value }
	
    set tree( tree ){
        if( typeof tree === 'undefined' || tree === null ) {
            throw new TypeError( 'Cannot direclty unset a node\'s tree property. Please use the `node.free()` method to properly disassociate it from its tree.' );
        } 
        if( !Tree.isValid( tree ) ) {
            throw new TypeError( 'Cannot attach a node to an invalid tree.' );
        }
        const currentTree = this.tree;
        if( tree === currentTree ) { return }
        currentTree && this.free();
        this.#treeRef = new WeakRef( tree );
        this.join();
    }

	set value( value ){
        if( this.#value === value ) { return }
        this.#value = value;
        this.tree?.synchronize( this );
    }

    /**
     * Detach self from current tree
     * @throws {Error} On attempt to detach self from a tree while in the process of joining a tree
     */
    detach() {
        if( this.#isDetached ) { return this }
        this.#transition = TreeNode.Transition.DETACHING;
        this.#remove();
        this.#unsubTreeCleanup = this.tree?.onCleanup(() => this.free());
        this.#transition = TreeNode.Transition.COMPLETE;
        return this;
    }

    /** completely dissociate self from its tree */
    free() {
        if( this.isFree ) { return this }
        this.#transition = TreeNode.Transition.DISASSOCIATING;
        if( !this.tree.isDisposing ) {
            !this.#isDetached && this.#remove();
            this.#stopTreeCleanupWatch();
        }
        this.#treeRef = null;
        this.#transition = TreeNode.Transition.COMPLETE
        return this;
    }

    /**
     * @param {number} [nGenerations] ancestor position in proximity to this TreeNode. eg TreeNode.root has nGenerations = 1.
     * @returns {Generator<TreeNode<T>>} parent nodes up the tree until `nGenerations` ancestors reached or tree height exhausted
     */
    *genAncestors( nGenerations = Number.POSITIVE_INFINITY ) {
        for( let parent = this.root, i = 0; i < nGenerations && parent !== null; i++, parent = parent.root ) {
            yield parent;
        }
    }

    /**
     * @param {number} [nGenerations] descendants sorted in asc order starting left -> right
     * @returns {Generator<TreeNode<T>>} descendant nodes down the tree until `nGenerations` descendants reached or tree depth exhausted
     */
    *genDescendants( nGenerations = Number.POSITIVE_INFINITY ) {
        yield* genDescendantsFrom( this, nGenerations );
    }

    /**
     * @param {TreeNode<T>} [ancestorNode]
     * @returns {Generator<TreeNode<T>>} parent nodes up the tree until `anscestorNode`. Returns empty array if `ancestorNode` not found in the hierarchy
     */
    *genParentsUntil( ancestorNode ) {
        for( let parent = this.root; parent !== null; parent = parent.root ) {
            yield parent;
            if( parent === ancestorNode ) { break }
        }
    }

    /**
     * @param {number} [nGenerations] ancestor position in proximity to this TreeNode. eg TreeNode.root has nGenerations = 1.
     * @returns {Array<TreeNode<T>>} parent nodes up the tree until `nGenerations` ancestors reached or tree height exhausted
     */
    getAncestors( nGenerations = Number.POSITIVE_INFINITY ) {
        return [ ...this.genAncestors( nGenerations ) ];
    }

    /**
     * @param {number} [nGenerations] descendants sorted in asc order starting left -> right
     * @returns {Array<TreeNode<T>>} descendant nodes down the tree until `nGenerations` descendants reached or tree depth exhausted
     */
    getDescendants( nGenerations = Number.POSITIVE_INFINITY ) {
        return [ ...genDescendantsFrom( this, nGenerations ) ];
    }

    /**
     * @param {TreeNode<T>} ancestorNode
     * @returns {Array<TreeNode<T>>} parent nodes up the tree until `anscestorNode`. Returns empty array if `ancestorNode` not found in the hierarchy
     */
    getParentsUntil( ancestorNode ) { return [ ...this.genParentsUntil( ancestorNode ) ] }

    /**
     * Joins self to current tree
     * 
     * @throws {ReferenceError} For non-existent tree property
     * @throws {Error} On attempt to join a tree while detaching from a tree
     */
    join() {
        if( !this.#isDetached ) { return this }
        const tree = this.tree;
        if( !tree ) {
            this.#isDetached = true;
            throw new ReferenceError( 'Cannot join node. Referenced tree does not exist.' );
        }
        this.#transition = TreeNode.Transition.JOINING;
        tree.insertNode( this );
        this.#stopTreeCleanupWatch();
        this.#isDetached = false; 
        this.#transition = TreeNode.Transition.COMPLETE;
        return this;
    }

    #remove() {
        this.tree?.removeNode( this );
        this.#isDetached = true;
    }

    #stopTreeCleanupWatch() {
        if( !this.#unsubTreeCleanup ) { return }
        this.#unsubTreeCleanup();
        this.#unsubTreeCleanup = null;
    }
}

/**
 * @class
 * @template [T]
 */
class Tree {

    /**
     * @static
     * @type {DEFAULT_CONSTANT}
     */
    static DEFAULT = '__DEFAULT__';

    /**
     * @static
     * @type {Readonly<TraversalDirection>}
     */
    static Direction = Object.freeze({
        LEFT: 'RTL',
        RIGHT: 'LTR'
    });

    /**
     * @static
     * @type {Readonly<{[K in "isSameValue"|"isValueBefore"]: K}>}
     */
    static CriterionTypes = Object.freeze({
        isSameValue: 'isSameValue',
        isValueBefore: 'isValueBefore'
    });

    static INVALID_NODE_MESSAGE = 'Invalid node type detected.';

    static TREE_MISMATCH_MESSAGE = 'Cannot perform this operation on a node which does not belong to this tree.';

    /**
     * @static
     * @param {Tree<T>} tree
     * @template [T]
     */
    static isValid( tree ) { return tree instanceof Tree }

    /**
     * @static
     * @type {Readonly<TraversalOrder>}
     */
    static Order = Object.freeze({
        IN: 'IN_ORDER',
        POST: 'POST_ORDER',
        PRE: 'PRE_ORDER'
    });

    /** @type {boolean} */ #isDisposing = false;
    /** @type {Criterion<T>} */ #isSameValue;
    /** @type {Criterion<T>} */ #isValueBefore;
    /**
     * These are currently accessible nodes
     * @type {Array<TreeNode<T>>}
     */
    #nodes = [];

    /** @type {TreeNode<T>} */ #root = null;

    /** @type {Publisher} */ #publisher = new Publisher();

	/**
     * Note: `options.isSameValue` config property uses `Object.is()` equality check out of the box
     * 
	 * @constructor
     * @param {Iterable<T>} [values]
	 * @param {TreeOptions<T>} [options]
	 */
	constructor( values = [], options = EMPTY_OBJ ) {
        const criteria = {};
        for( const k in Tree.CriterionTypes ) {
            criteria[ k ] = k in options ? options[ k ] : undefined;
        }
        this.criteria = criteria;
        this.#isDisposing = false;
        this.values = values;
    } 

    /** @readonly */
	get isDisposing() { return this.#isDisposing }
    get isSameValue() { return this.#isSameValue }
    get isValueBefore() { return this.#isValueBefore }
    /** @readonly */
	get size(){ return this.#nodes.length }
    /** specifically an array of values encased in non-detached nodes of this tree */
    get values() { return this.#nodes.map(({ value }) => value ) }

    /**
     * sets both `isSameValue` and `isValueBefore` propeties simultaneously.
     * omitted properties are ignored.
     * properties set to undefined are replaced with the default matching criteria.
     * set to undefined to reset both `isSameValue` and `isValueBefore` properties to their internal default functions.
     * 
     * @param {{
     *      isSameValue?: Criterion<T> | DEFAULT_CONSTANT,
     *      isValueBefore?: Criterion<T> | DEFAULT_CONSTANT
     * }} [criteria]
     */
    set criteria( criteria = {
        isSameValue: Tree.DEFAULT,
        isValueBefore: Tree.DEFAULT
    } ) {
        const opts = {}
        for( const c in criteria ) {
            if( !( c in Tree.CriterionTypes ) ) {
                throw new TypeError( `Unrecognized criteria key "${ c }".` );
            }
            let cFn =  criteria[ c ];
            let cType = typeof cFn;
            if( cType === 'undefined' ) {
                cFn = Tree.DEFAULT;
                cType = typeof cFn;
            }           
            if( cFn === this[ c ] ) { continue }
            if( cFn === Tree.DEFAULT ) {
                switch( c ) {
                    case Tree.CriterionTypes.isSameValue: {
                        /* istanbul ignore else */
                        if( this.#isSameValue !== isSameValueDefaultFn ) { opts.isSameValue = isSameValueDefaultFn }
                        break;
                    }
                    case Tree.CriterionTypes.isValueBefore: {
                        /* istanbul ignore else */
                        if( this.#isValueBefore !== isValueBeforeDefaultFn ) { opts.isValueBefore = isValueBeforeDefaultFn }
                        break;
                    }
                }
                continue;
            }
            if( cType !== 'function' ) {
                throw new TypeError( `Invalid attempt to set tree\'s "${ c }" property. Either unset it or set to either a function or Tree.DEFAULT.` );
            }
            opts[ c ] = cFn;
        }
        if( !Object.keys( opts ).length ) { return }
        if( Tree.CriterionTypes.isSameValue in opts ) { this.#isSameValue = opts.isSameValue }
        if( Tree.CriterionTypes.isValueBefore in opts ) { this.#isValueBefore = opts.isValueBefore }
        this.#refresh();
    }

	/**
     * setting this property to undefined or Tree.DEFAULT will reset it to default
     * 
     * @param {Criterion<T>} [isSameValue]
     */
	set isSameValue( isSameValue = Tree.DEFAULT ){ this.criteria = { isSameValue } }
	/**
     * setting this property to undefined or Tree.DEFAULT will reset it to default
     * 
     * @param {Criterion<T>} [isSameValue] 
     */
	set isValueBefore( isValueBefore = Tree.DEFAULT ){ this.criteria = { isValueBefore } }
    /**
     * setting this property to undefined will reset it. Alias: `this.clear()`
     * 
     * @param {Iterable<T>} [_values]
     * @throws {TypeError} for non-iterable input
     */
	set values( _values = [] ) {
        let nodes = [];
        try {
            for( const v of _values ) { nodes.push( new TreeNode( this, v ) ) }
        } catch( e ) {
            /* istanbul ignore else */
            if( e.constructor.name === 'TypeError' && e.message.startsWith( 'Invalid attempt to iterate ' ) ) {
                throw new TypeError( 'Can only set values property to either an array or undefined.' );
            }
            /* istanbul ignore next */
            throw e;
        }
        if( !nodes.length ) {
            if( !this.#nodes.length ) { return }
            this.#nodes.length = 0;
            this.#root = this.#rotate();
            return 
        }
        nodes = nodes.sort(({ value }, node ) => this.compare( value, node ));
        let node = nodes.shift();
        node[ nodeAccessMap.get( node ).index ] = 0;
        const uniqueNodes = [ node ];
        let hasSameValues = this.size !== 0 && this.#isSameValue( uniqueNodes[ 0 ].value, this.#nodes[ 0 ], this );
        let uLen;
        while( nodes.length ) {
            uLen = uniqueNodes.length;
            node = nodes.shift();
            if( !this.#isSameValue( node.value, uniqueNodes[ uLen - 1 ], this ) ) {
                node[ nodeAccessMap.get( node ).index ] = uLen;
                uniqueNodes.push( node );
                /* istanbul ignore next */
                if( hasSameValues && ( !this.#isSameValue( node.value, this.#nodes[ uLen - 1 ], this ) || uLen === this.size ) ) {
                    hasSameValues = false;
                }
            }
        }
        /* istanbul ignore next */
        if( hasSameValues ) { return }
        this.#nodes = uniqueNodes;
        this.#root = this.#rotate();
    }

    /**
     * Call this before deleting your tree instance to ensure immediate release
     * of any longer-living nodes (i.e. detached nodes) and resources
     */
    cleanup() {
        this.#isDisposing = true;
        this.#publisher.publish( CLEANUP_EVENTNAME ).cleanup();
        this.#isDisposing = false;
        return this;
    }

    /** discards all active nodes */
    clear() {
        this.values = undefined;
        return this;
    }

    /**
     * @param {T} value 
     * @param {TreeNode<T>} node
     * @throws {TypeError} Invoid node argument type
     */
    compare( value, node ) {
        throwOnInvalidNode( node );
        return this.#isSameValue( value, node, this )
            ? 0
            : this.#isValueBefore( value, node, this )
                ? -1
                : 1;
    }

    /**
     * @param  {TraversalOptions} [options]
     * @returns {Generator<TreeNode<T>>}
     * @throws {Error} Invalid argument values
     * @throws {TypeError} Invalid argument types
     * @see TraversalOptions
     */
    *genTraversal( options = EMPTY_OBJ ) {
        if( this.#root === null ) { return }
        const len = this.#nodes.length;
        let {
            direction = Tree.Direction.RIGHT,
            maxLength = undefined,
            order = Tree.Order.IN,
            start = undefined
        } = options;
        if( direction !== Tree.Direction.LEFT && direction !== Tree.Direction.RIGHT ) {
            throw new Error( 'Invalid `direction` option supplied to `traverse` method. A member of Tree.Direction expected or leave it unset.' );
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
        const nodes = this.#nodes;
        switch( order ) {
            case Tree.Order.IN: {
                maxLength = maxLength ?? len;
                if( direction === Tree.Direction.RIGHT ) {
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
            case Tree.Order.POST: yield* this.#genPostOrder( direction, maxLength, nodes[ start ] ); break;
            case Tree.Order.PRE: yield* this.#genPreOrder( direction, maxLength, nodes[ start ] );
            break;
            default: throw new Error( 'Unknown order detected. Member of the `Tree.Order` expected or leave it unset.' );
        }
    }

    /**
     * Returns node located at index using a left-to-right in-order traversal
     * @param {number} index - index can be negative index number to count from the end
     */
    getNodeAt( index ) { return this.#nodes[ index < 0 ? this.#nodes.length + index : index ] }

    /**
     * @param {T} value 
     * @param {number} [start] - negative integer accepted to caunt from the end. 
     * @param {number} [end] - negative integer accepted to caunt from the end.
     * @returns {number}
     */
    indexOf( value, start = 0, end = this.size - 1 ) {
        let last = this.#nodes.length - 1;
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
                return this.compare( value, this.#nodes[ start ] ) === 0
                    ? start
                    : -1
            }
        }
        let mid, node;
        do {
            mid = Math.floor( ( start + end ) / 2 );
            node = this.#nodes[ mid ];
            switch( this.compare( value, node ) ) {
                case -1: end = mid - 1; break;
                case 1: start = mid + 1; break;
                default: return node.index;
            }
        } while( start <= end );
        return -1;
    }
    
    /** @param {T} value */
    insert( value ) {
        const iIndex = this.#findInsertionIndex( value );
        return iIndex !== -1
            ? this.#insertNodeAt( new TreeNode( this, value, iIndex ), iIndex )
            : this;
    }
    
    /**
     * @param {TreeNode<T>} node
     * @throws {TypeError} For attempting to insert an invalid node.
     * @throws {ReferenceError} For attempting to insert a node into an unassociated tree.
     */
    insertNode( node ) {
        throwOnInvalidNode( node );
        throwOnNodeTreeMismatch( this, node );
        if( !node.isDetached ) { return this }
        if( node.transition !== TreeNode.Transition.JOINING ) {
            node.join();
            return this;
        }
        return this.#insertNodeAt( node, this.#findInsertionIndex( node.value ) );
    }

    /**
     * Listen to this tree's cleanup event.
     * 
     * @param {Subscriber} subscriber
     * @return {UnsubscribeFn}
     */
    onCleanup( subscriber ) { return this.#publisher.subscribe( CLEANUP_EVENTNAME, subscriber ) }
    
    /** @param {T} value */
    remove( value ) {
        if( !this.size ) { return this }
        const deleteIndex = this.indexOf( value );
        deleteIndex !== -1 && this.#nodes[ deleteIndex ].free();
        return this;
    }

    /**
     * @param {TreeNode<T>} node 
     * @throws {TypeError} For attempting to remove an invalid node.
     * @throws {ReferenceError} For attempting to remove a node from a tree it does not belong.
     */
    removeNode( node ) {
        throwOnInvalidNode( node );
        throwOnNodeTreeMismatch( this, node );
        if( node.transition !== TreeNode.Transition.DETACHING &&
            node.transition !== TreeNode.Transition.DISASSOCIATING
        ) {
            node.free();
            return this;
        }
        return this.#updateNodeAt( node.index );
    }

    /**
     * Ensures that changes in node value are balanced
     * 
     * @param {TreeNode<T>} node
     * @throws {TypeError} For attempting to synchronize an invalid node.
     * @throws {ReferenceError} For attempting to synchronize a node into a tree it does not belong.
     */
    synchronize( node ) {
        throwOnInvalidNode( node );
        throwOnNodeTreeMismatch( this, node );
        if( node.isDetached ) { return this }
        const { index: oldIndex } = node;
        this.#nodes.splice( oldIndex, 1 );
        const iIndex = this.#findInsertionIndex( node.value );
        if( iIndex === -1 ) { return this }
        if( iIndex === oldIndex ) {
            this.#nodes.splice( oldIndex, 0, node );
            return this;
        }
        this.#nodes.splice( iIndex, 0, node );
        if( iIndex < oldIndex ) {
            for( let i = iIndex; i <= oldIndex; i++ ) {
                node = this.#nodes[ i ];
                node[ nodeAccessMap.get( node ).index ] = i;
            }
            return this;
        }
        for( let i = oldIndex; i <= iIndex; i++ ) {
            node = this.#nodes[ i ];
            node[ nodeAccessMap.get( node ).index ] = i;
        }
        return this;
    }

    /**
     * @param {(node: TreeNode<T>) => void} [cb]
     * @param  {TraversalOptions} [options]
     * @return {void|Array<TreeNode<T>>} Returms TreeNodes if no `cb` param  and `void` if `cb` param 
     * @throws {Error} Invalid argument values
     * @throws {TypeError} Invalid argument types
     * @see TraversalOptions
     */
    traverse( cb, options ) {
        /** @type Array<TreeNode<T>> */ let nodes;
        if( typeof cb === 'undefined' ) {
            nodes = [];
            cb = n => { nodes.push( n ) };
        }
        if( typeof cb !== 'function' ) {
            throw new TypeError( 'Invalid `cb` argument supplied to `traverse` method. Void function expected' );
        }
        const gen = this.genTraversal( options );
        for( let it = gen.next(); !it.done; it = gen.next() ) { cb( it.value ) }
        return nodes;
    }
    
    /**
     * @param {T} value
     * @returns {number}
     */
    #findInsertionIndex( value ) {
        if( !this.#nodes.length ) { return 0 }
        let start = 0;
        let end = this.#nodes.length - 1;
        let mid, node;
        do {
            mid = Math.floor( ( start + end ) / 2 );
            node = this.#nodes[ mid ];
            switch( this.compare( value, node ) ) {
                case -1: { 
                    if( mid === 0 ) { return 0 }
                    const compPrevVal = this.compare( value, this.#nodes[ mid - 1 ] );
                    if( compPrevVal === 1 ) { return mid }
                    if( compPrevVal === 0 ) { return -1 }
                    end = mid - 1;
                    break;
                }
                case 1: {
                    if( mid === this.#nodes.length - 1 ) { return this.#nodes.length }
                    const compNextVal = this.compare( value, this.#nodes[ mid + 1 ] );
                    if( compNextVal === -1 ) { return mid + 1 }
                    if( compNextVal === 0 ) { return -1 }
                    start = mid + 1;
                    break;
                }
                default: return -1;
            }
        } while( true );
    }

    /** @type {TraversalStrategy<T>} */
    *#genPostOrder(
        /* istanbul ignore next */
        direction = Tree.Direction.RIGHT,
        /* istanbul ignore next */
        traversalLength = undefined,
        /* istanbul ignore next */
        startNode = undefined
    ) {
        direction === Tree.Direction.RIGHT
            ? yield* this.#ltrPostOrder( startNode, traversalLength )
            : yield* this.#rtlPostOrder( startNode, traversalLength )
    }

    /** @type {TraversalStrategy<T>} */
    *#genPreOrder(
        /* istanbul ignore next */
        direction = Tree.Direction.RIGHT,
        /* istanbul ignore next */
        traversalLength = null,
        /* istanbul ignore next */
        startNode = null
    ) {
        direction === Tree.Direction.RIGHT
            ? yield* this.#ltrPreOrder( startNode, traversalLength )
            : yield* this.#rtlPreOrder( startNode, traversalLength )
    }

    /** 
     * @param {TreeNode<T>} node 
     * @param {number} [insertionIndex]
     */
    #insertNodeAt(
        node,
        /* istanbul ignore next */
        insertionIndex = null
    ) {
        /* istanbul ignore next */
        if( insertionIndex === -1 ) { return this }
        /* istanbul ignore else */
        if( node.index !== insertionIndex ) {
            node[ nodeAccessMap.get( node ).index ] = insertionIndex;
        }
        return this.#updateNodeAt( insertionIndex, node );
    }

    /** @type {PostOrderTraversal<T>} */
    *#ltrPostOrder(
        startNode = this.#nodes[ 0 ],
        traversalLength = this.#nodes.length,
        visited = { count: 0 },
        isChild = false
    ) {
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
                return yield* this.#ltrPostOrder( startNode.root?.root, traversalLength, visited );
            }
            return yield* this.#ltrPostOrder( startNode.root, traversalLength, visited );
        }
        if( isChild ) {
            yield* this.#ltrPostOrder( startNode.left, traversalLength, visited, true );
            yield* this.#ltrPostOrder( startNode.right, traversalLength, visited, true );
            if( visited.count === traversalLength ) { return }
            visited.count++;
            return yield startNode;
        }
        yield* this.#ltrPostOrder( startNode.right, traversalLength, visited, true );
        if( visited.count < traversalLength ) {
            visited.count++;
            yield startNode;
        }
        yield* this.#ltrPostOrder( startNode.root, traversalLength, visited );
    };

    /** @type {PreOrderTraversal<T> */
    *#ltrPreOrder(
        /* istanbul ignore next */
        startNode = null,
        /* istanbul ignore next */
        traversalLength = null,
        visited = { count: 0 },
        root = this.#root
    ) {
        if( !root || (
            traversalLength && visited.count === traversalLength
        ) ) {   return  }
        if( !startNode || visited.count || startNode === root ) {
            visited.count++;
            yield root;
        }
        yield* this.#ltrPreOrder( startNode, traversalLength, visited, root.left );
        yield* this.#ltrPreOrder( startNode, traversalLength, visited, root.right );
    }

    #refresh() {
        if( !this.size ) { return this }
        const values = this.values;
        this.clear();
        this.values = values;
        return this;
    }

    /**
     * @param {number} [start] start rotation at this index
     * @param {number} [end] end rotation at this index
     * @returns {TreeNode<T>} tree/subtree root
     */
    #rotate( start = 0, end = this.#nodes.length - 1 ) {
        if( start > end ) { return null }
        const mid = Math.floor( ( start + end ) / 2 );
        const root = this.#nodes[ mid ];
        /* istanbul ignore else */
        if( root ) {
            root[ nodeAccessMap.get( root ).left ] = this.#rotate( start, mid - 1 );
            root[ nodeAccessMap.get( root ).right ] = this.#rotate( mid + 1, end );
        }
        return root;
    }
    
    /** @type {PostOrderTraversal<T>} */
    *#rtlPostOrder(
        /* istanbul ignore next */
        startNode = this.#nodes[ this.#nodes.length - 1 ],
        /* istanbul ignore next */
        traversalLength = this.#nodes.length,
        /* istanbul ignore next */
        visited = { count: 0 },
        /* istanbul ignore next */
        isChild = false
    ) {
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
                return yield* this.#rtlPostOrder( startNode.root?.root, traversalLength, visited );
            }
            return yield* this.#rtlPostOrder( startNode.root, traversalLength, visited );
        }
        if( isChild ) {
            yield* this.#rtlPostOrder( startNode.right, traversalLength, visited, true );
            yield* this.#rtlPostOrder( startNode.left, traversalLength, visited, true );
            /* istanbul ignore next */
            if( visited.count === traversalLength ) { return }
            visited.count++;
            return yield startNode;
        }
        yield* this.#rtlPostOrder( startNode.left, traversalLength, visited, true );
        /* istanbul ignore else */
        if( visited.count < traversalLength ) {
            visited.count++;
            yield startNode;
        }
        yield* this.#rtlPostOrder( startNode.root, traversalLength, visited );
    }

    /** @type {PreOrderTraversal<T>} */
    *#rtlPreOrder(
        /* istanbul ignore next */
        startNode = null,
        /* istanbul ignore next */
        traversalLength = null,
        visited = { count: 0 },
        root = this.#root
    ) {
        if( !root || (
            traversalLength && visited.count === traversalLength
        ) ) {   return  }
        if( !startNode || visited.count || startNode === root ) {
            visited.count++;
            yield root;
        }
        yield* this.#rtlPreOrder( startNode, traversalLength, visited, root.right );
        yield* this.#rtlPreOrder( startNode, traversalLength, visited, root.left );
    }

    /**
     * @param {number} index 
     * @param {TreeNode<T>} [newNode] Inserts into index when newNode present. Otherwise, removes node at index.
     */
    #updateNodeAt( index, newNode ) {
        const nodes = this.#nodes;
        newNode
            ? nodes.splice( index, 0, newNode )
            : nodes.splice( index, 1 );
        for( let i = index, nLen = nodes.length; i < nLen; i++ ) {
            const node =  nodes[ i ];
            node[ nodeAccessMap.get( node ).index ] = i;
        }
        this.#root = this.#rotate();
        return this;
    }
}

/**
 * Checks if a value equals the current node's value
 * Note: uses Object.is(...) equality check
 * 
 * @type {Criterion<T>}
 * @template [T]
 */
function isSameValueDefaultFn( value, node ) { return Object.is( value, node.value ) }

/**
 * Checks if a value is less than the current node's value.
 * Note: uses '>' for string and number values and returns false for the rest.
 * 
 * @type {Criterion<T>}
 * @template [T]
 */
function isValueBeforeDefaultFn( value, node ) {
    return isString( value ) || isNumber( value )
        ? value < node.value
        : false;
}

/**
 * @param {TreeNode<T>} node ancestor node
 * @param {number} nGenerations how many generations of descendants to collect
 * @param {boolean} [isDescendant = false] is the `node` parameter a descendant of a prior visited node?
 * @return {Generator<TreeNode<T>>}
 * @template [T]
 */
function* genDescendantsFrom( node, nGenerations, isDescendant = false ) {
    if( node === null || nGenerations === 0 ) { return }
    yield* genDescendantsFrom( node.left, nGenerations - 1, true );
    if( isDescendant ) { yield node }
    yield* genDescendantsFrom( node.right, nGenerations - 1, true );
}

/**
 * @param {TreeNode<T>} node
 * @template [T]
 */
function registerNodeInternalsFor( node ) {
    /** @type {NodeInternalTokensMap} */
    const internals = {};
    internals_construct: {
        const visited = {};
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

/**
 * @param {TreeNode<T>} node
 * @throws {TypeError} on invalid node type
 * @template [T]
 */
function throwOnInvalidNode( node ) {
    if( !TreeNode.isValid( node ) ) {
       throw new TypeError( Tree.INVALID_NODE_MESSAGE );
    }
}

/**
 * @param {Tree<T>} currentTree
 * @param {TreeNode<T>} node
 * @throws {ReferenceError} on invalid node type
 * @template [T]
 */
function throwOnNodeTreeMismatch( currentTree, node ) {
    if( node.tree !== currentTree ) {
        throw new ReferenceError( Tree.TREE_MISMATCH_MESSAGE );
    }
}

function isNumber( /** @type {*} */ v ){ return isType( v, 'number', Number ) }

function isString( /** @type {*} */ v ){ return isType( v, 'string', String ) }

/**
 * @param {*} value
 * @param {string} [typeName]
 * @param {Function} [constructor]
 */
/* istanbul ignore next */
function isType ( value, typeName = 'object', constructor = undefined ) {
    if( value === null ) { return false }
    const _type = typeof value;
    return _type === 'object' && typeof constructor !== 'undefined'
        ? value[ 'constructor' ] === constructor
        : _type === typeName;
};

export default Tree
