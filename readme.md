# Auto-BST (Self-balancing Binary Search Tree)

**Name:** Auto-BST

**Install:**\
npm i -S @webkrafters/auto-bst

# Description

Self-balancing binary search tree data structure for typescripters and javascript users. 

Tree contents are automatically **deduped** and **sorted** according to either the user supplied comparer functions when available or the default ones otherwise.

**Automatically rebalances when properties are set to new values.**

# Usage

```js
import AutoBST from '@webkrafters/auto-bst';

const timedMap = new AutoBST(); // defaults to empty tree with default isValueBefore (<) and isSameValue (Object.is) camparer options

```

# Public Interface

## Constructor

### constructor(values: Iterable&lt;T&gt;, options?: <a href="#tree-options">TreeOptions&lt;T&gt;</a>)

- values: optional parameter accepts a parcel of data of any iterable type irrespective of its nature - Sorted or unsorted; unique or with duplicates.
- options: custom node comparison strategies may be supplied through this optional parameter accepting a payload of the <a href="#tree-options">TreeOptions&lt;T&gt;</a> type. Espcially, when managing complex values, consider utilizing this payload parameter.

<h4 id="tree-options"><u>TreeOptions&lt;T&gt;</u>: Object</h4>

- TreeOptions&lt;T&gt;.isSameValue?: Criterion&lt;T&gt;<br />
- TreeOptions&lt;T&gt;.isValueBefore?: Criterion&lt;T&gt;<br />

<h4 id="criterion"><u>Criterion&lt;T&gt;</u> = (value: T, node: TreeNode&lt;T&gt;, this: Tree&lt;T&gt;): boolean</h4>

#### <u>TreeNode&lt;T&gt;</u> = please see <a href="#tree-node">here</a>

## Instance Properties

### criteria: <a href="#tree-options">TreeOptions&lt;T&gt;</a> - writeonly

Sets both `isSameValue` and `isValueBefore` propeties simultaneously.

- omitted properties are ignored.
- properties set to `undefined` are replaced with the default matching criteria.
- set to `undefined` to reset both `isSameValue` and `isValueBefore` properties to their internal default functions.

### isDisposing: boolean - readonly

Sets while the tree is in the clean-up process. Clean up process starts when the user invokes the `cleanup(...)` method. 
     
### isSameValue: <a href="#criterion">Criterion&lt;T&gt;</a>

A function to determine if parameter1 is a value equaling the value property of parameter2.

- Setting this property to `undefined` or Tree.DEFAULT will reset it to default.

### isValueBefore: <a href="#criterion">Criterion&lt;T&gt;</a>

A function to determine if parameter1 is a value whose node should come before parameter2.

- Setting this property to `undefined` or Tree.DEFAULT will reset it to default

### size: int - readonly

Number of undetached nodes on the tree

### values: Iterable&lt;T&gt;

Array&lt;T&gt; values of all undetached nodes in the tree. Accepts any Iterable&lt;T&gt; type.

- Setting this property to `undefined` will reset it. Alias: `this.clear()`

## Instance Methods

### cleanup(): void

Triggers the immediate disassociation of any longer-living associated objects (such as detached nodes).

<b><i><u>Recommended:</u></i></b> invoke this method before either deleting your tree instance or setting it to null.   

### clear(): void

Disassociates all undetached nodes from the tree.

### compare(value: T, node: <a href="#tree-node">TreeNode&lt;T&gt;</a>): 0 | 1 | -1

Compares certain value to the value of an undetached node in this tree using the current `isSameValue` and `isValueBefore` properties.

### genTraversal(options?: TraversalOptions): Generator&lt;<a href="#tree-node">TreeNode&lt;T&gt;</a>&gt;

Generator method for this tree traversal.

<h4 id="traversal-options"><u>TraversalOptions</u>: Object</h4>

- TraversalOptions.direction?: <a href="#traversal-direction">TraversalDirection</a>[keyof <a href="#traversal-direction">TraversalDirection</a>];<br />
- TraversalOptions.maxLength?: int;<br />
- TraversalOptions.order?: <a href="#traversal-order">TraversalOrder</a>[keyof <a href="#traversal-order">TraversalOrder</a>];<br />
- TraversalOptions.start?: int; <b><i>// this property may be negative to start -N places from `tree.size`.</i></b><br />

<h4 id="traversal-direction"><u>TraversalDirection</u>: Object</h4>

- TraversalDirection.RIGHT: "LTR";<br />
- TraversalDirection.LEFT: "RTL";<br />

<h4 id="traversal-order"><u>TraversalOrder</u>: Object</h4>

- TraversalOrder.IN: "IN_ORDER";<br />
- TraversalOrder.POST: "POST_ORDER";<br />
- TraversalOrder.PRE: "PRE_ORDER";<br />

### getNodeAt(index: int): <a href="#tree-node">TreeNode&lt;T&gt;</a>

Returns the undetached node located at the supplied index using a <b>Left-to-Right In-Order</b> traversal.

<b><i><u>Attention:</u></i></b> index parameter also accepts a negative integer to obtain the node located -N places from `tree.size`.
    
### indexOf(value: T, start?: int, end?: int): int

Returns the **Left-to-Right In-Order** traversal index of an undetached node in the tree whose value is the same as the first argument.

<b><i><u>Attention:</u></i></b> may provide a ranged search through the `start` and the `end` optional arguments.

- `start:` optional parameter is assigned `0` by default. When assigned a value exceeding `tree.size - 1`, method immediately returns -1. When negative, method attempts to resolve it by applying `tree.size + start`. If still negative, method begins its search from index #0.

- `end:` optional parameter is assigned `tree.size - 1` by default. When assigned a value exceeding `tree.size - 1`, method searches to until the end of the tree. When negative, method attempts to resolve it by applying `tree.size + end`. When the resolved end index is still less than the start index, method searches only the value at start index. Otherwise, method searches up to and including the resolved end index.

### insert(value: T): this

Creates and inserts a node constaining the `value` argument into the tree such that the tree remains balanced.

- An attempt to insert duplicate values to the tree is a no op.

### insertNode(node: <a href="#tree-node">TreeNode&lt;T&gt;</a>): this

Re-inserts either a free node into a tree or a detached but associated node back into its tree.<br />
<u>Alternate API:</u> `node.join(...)`

1. An attempt to insert an undetached node is a no op.
2. An attempt to insert any node into a tree with which it is not associated is a `ReferenceError`.

### remove(value: T): this

Disassociates from its tree an associated node whose `value` property is `isSameValue` as the `value` parameter.

### removeNode(node: <a href="#tree-node">TreeNode&lt;T&gt;</a>): this

Disassociates an associated node from its tree.<br />
<u>Alternate API:</u> `node.free(...)`

- An attempt to remove an unassociated node is a `ReferenceError`.

### rotate(): this

Balances this tree.

- Rarely ever needed as this tree is self-balancing.
- It may come in handy for unit test mock purposes. 
- An attempt to perform this op on a balanced tree is a no op.

### synchronize(node: <a href="#tree-node">TreeNode&lt;T&gt;</a>): this

This method synchronizes changes in the value property of an undetached node with its tree.

- When a node value property is set to a new value, this method is notified automatically.
- When a user mutates a node value property, they may use this method to do the synchronization manually. 

1. An attempt to perform this op on an undetached node is a no op.
2. An attempt to perform this op on an unassociated node is a `ReferenceError`.

### traverse(cb?: VoidFunction, options?: <a href="#traversal-options">TraversalOptions</a>): void | Array&lt;<a href="#tree-node">TreeNode&lt;T&gt;</a>&gt;

Traverses undetached tree nodes.

- `cb:` optional parameter accepts a callback to be invoked on every traversed node.<br /><b><u>signature:</u></b>
(node: <a href="#tree-node">TreeNode&lt;T&gt;</a>): void<br />
When this argument is in its default `undefined` state, the method returns an array of the nodes traversed.<br />Otherwise, `void` is returned.

- `options:` optional parameter accepts a <a href="#traversal-options">TraversalOptions</a> payload object containing traversal direction, order and range. This argument, by default, holds the directive for the traditional IN_ORDER traversal (i.e. a right ward in-order traversal of the entire tree).

## Static Properties

### DEFAULT: DEFAULT_CONSTANT

Default settings string

### Direction: Readonly&lt;<a href="#traversal-direction">TraversalDirection</a>&gt;

Tree traversal direction options.

<h3 id="criterion-type"> CriterionType: Readonly&lt;CriterionType&gt;</h3>

- CriterionType.isSameValue: "isSameValue"
- CriterionType.isValueBefore: "isValueBefore"

### INVALID_NODE_MESSAGE: string

Invalid node error message text: when performing tree operations on an invalid node type.

### TREE_MISMATCH_MESSAGE: string

Tree mismatch error message text: when performing tree operations on an unassociated node.

<h3 id="transition-type"> TransitionType: Readonly&lt;Transition&gt;</h3>

- Transition.COMPLETE: 0;<br />
- Transition.DETACHING: -1;<br />
- Transition.DISASSOCIATING: 2;<br />
- Transition.JOINING: 1;<br />

### Order: Readonly&lt;<a href="#traversal-order">TraversalOrder</a>&gt;

Tree traversal order options.

## Static Method

### isValid(tree: Tree&lt;T&gt;): boolean

Verifies a valid tree type.

<br />

----------------------------------------------------------------

<h1 id="tree-node"><b>TreeNode</b></h1>

## Constructor

### constructor(tree: Tree&lt;T&gt;, value?: T, index?: int)

*This is an internal constructor used by the Tree to spin up new nodes as needed. 

Nevertheless:
- `tree:` parameter accepts a reference to the tree creating this node.
- `value:` optional parameter accepts the node initial value.
- `index:` optional parameter accepts this node index on the tree (according to the <b>Left-to-Right In-Order</b> positioning)

## Instance Properties

### children: Array&lt;TreeNode&lt;T&gt;&gt; - readonly

Holds the left and right child nodes respectively

### index: int - readonly

<b>Left-to-Right In-Order</b> index positioning of this node on the tree.

This property changes whenever its tree rebalances.

However, if this node is detached from its tree, then this property may become stale.

### isDetached: boolean - readonly

Is set if this node is currently associated to but not an accessible part of its tree.

### isFree: boolean - readonly

Is set if this node is not associated with any valid tree.

### left: TreeNode&lt;T&gt; - readonly

Left child node.

### right: TreeNode&lt;T&gt; - readonly

Right child node.

### root: TreeNode&lt;T&gt; - readonly

Parent node.

### transition: -1 | 0 | 1 | 2 - readonly

Current transitioning mode. This describes which tree transitioning process this node is currently undergoing.

See <a href="#transition-type">TransitionType</a>

### tree: Tree&lt;T&gt;

A tree instance with which this node is associated.

Updating this property disassociates this node from its current tree and moves it to the new tree property.

The disassociated tree self-rebalances <b>(if an undetached node is being disassociated)</b>.

The newly associated tree self-rebalances upon inserting this node into it.

### value: T

A value stored and held in this node.

Updating this property <b>(when this node is undetached)</b> triggers rebalancing of its associated tree.

Mutating this property is a no op.

## Instance Methods

### detach(): TreeNode&lt;T&gt;

Detaches (but not disassociate) this node from its associated tree. This node becomes inaccessible to its tree until reinstasted.

May use `tree.insertNode(...)` or `node.join(...)` to reinstate this node to its tree.

### free(): TreeNode&lt;T&gt;

Detaches (if not already detached) and disassociates this node from its associated tree.

### genAncestors(nGenerations?: number): Generator&lt;TreeNode&lt;T&gt;&gt;

Generates parent nodes up the tree until `nGenerations` ancestors reached or tree height exhausted.

- `nGenerations:` optional parameter accepts the ancestor position in proximity to this TreeNode. Exmaple: this `node.root` has nGenerations = 1.

### genDescendants(nGenerations?: number): Generator&lt;TreeNode&lt;T&gt;&gt;

Generates descendant nodes down the tree until `nGenerations` descendants reached or tree depth exhausted.

- `nGenerations:` optional parameter accepts the descendants sorted in ascending order starting from left to right.

### genParentsUntil(ancestorNode?: TreeNode&lt;T&gt;): Generator&lt;TreeNode&lt;T&gt;&gt;

Generates parent nodes up the tree until `anscestorNode` is reached - including the `ancestorNode`. Returns empty array if `ancestorNode` not found in the hierarchy.

### getAncestors(nGenerations?: number): Array&lt;TreeNode&lt;T&gt;&gt;

Returns parent nodes up the tree until `nGenerations` ancestors reached or tree height exhausted.

- `nGenerations:` optional parameter accepts the ancestor position in proximity to this TreeNode. Exmaple: this `node.root` has nGenerations = 1.
    
### getDescendants(nGenerations?: number): Array&lt;TreeNode&lt;T&gt;&gt;

Returns descendant nodes down the tree until `nGenerations` descendants reached or tree depth exhausted.

- `nGenerations:` optional parameter accepts the descendants sorted in ascending order starting from left to right.

### getParentsUntil(ancestorNode: TreeNode<T>): Array&lt;TreeNode&lt;T&gt;&gt;

Generates parent nodes up the tree until `anscestorNode` - including the `ancestorNode`. Returns empty array if `ancestorNode` not found in the hierarchy.

### join(): TreeNode&lt;T&gt;
  
Inserts this node (when detached) into its associated tree.

Unsets this node's `isDeatched` flag.

## License

	ISC
