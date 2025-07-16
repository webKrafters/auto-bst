import Tree, {
	CriteriaOptions,
	Criterion,
	TraversalDirection,
	TraversalOrder,
	TreeNode,
	TreeOptions
} from '.';

interface State<T = unknown> {
	detached: boolean,
	isInTree: boolean,
	tree: Tree<T>
};

jest.useFakeTimers();
const clearTimeoutSpy = jest.spyOn( global, 'clearTimeout' );
const setTimeoutSpy = jest.spyOn( global, 'setTimeout' );
afterAll(() => {
	clearTimeoutSpy.mockRestore();
	setTimeoutSpy.mockRestore()
	jest.useRealTimers();
});

describe( 'Tree', () => {
	describe( 'default tree', () => {
		let tree : Tree;
		beforeEach(() => { tree = new Tree() })
		afterEach(() => { tree = null });
		test( 'has zero values', () => {
			expect( tree.values ).toHaveLength( 0 );
		});
		test( 'has zero size', () => {
			expect( tree.size ).toBe( 0 );
		});
	});
	describe( 'default action options', () => {
		test( 'uses default `isValueBefore` option', () => {
			type Value = {a:number};
			let values : Array<Value> = [{a: 2}, {a: 0}, {a: 3}];
			let tree = new Tree<Value>( values );
			expect( tree.values ).toStrictEqual( values );
			const nextValue = {a: -3};
			tree.insert( nextValue );
			// default comparer simply append non-string & non-integer values in order of arrival.
			expect( tree.values ).toStrictEqual([ ...values, nextValue ]);
			// change comparer to sort by the `a` property
			tree.isValueBefore = ({ a }, { value: { a: nav }}) => a < nav;
			expect( tree.values ).toStrictEqual([{a:-3}, {a:0}, {a:2}, {a:3}]);
			tree = values = null;
		});
		test( 'uses default `isSameValue` option', () => {
			type Value = {a:number};
			const testValue : Value = {a: 2};
			let values : Array<Value> = [ {a:0}, testValue, {a:3} ];
			let tree = new Tree<Value>( values, {
				isValueBefore: ({ a }, { value: { a: nav } }) => a < nav
			} );
			// default isSameValue simply uses Object.is to reject duplicate entries
			const propertyPredicate = v => v.a === 2;
			expect([ ...tree.values ].filter( propertyPredicate ) ).toHaveLength( 1 );
			tree.insert( testValue );
			expect([ ...tree.values ].filter( propertyPredicate ) ).toHaveLength( 1 );
			tree.insert({ ...testValue });
			expect([ ...tree.values ].filter( propertyPredicate) ).toHaveLength( 2 );
			// change isSameValue to check equality by property equality
			tree.isSameValue = ({ a }, { value: { a: nav }}) => a === nav;
			expect([ ...tree.values ].filter( propertyPredicate ) ).toHaveLength( 1 );
			tree = values = null;
		});
	});
	describe( 'auto balances when', () => {
		test( 'criteris setter property initiates a change', () => {
			let tree = new Tree<number>([ 3, 0.33, 1, 5, 0, 6, 3.76, 2, 5.33, 4 ]);
			// numbers are sorted asc by default
			expect( tree.values ).toStrictEqual([ 0, 0.33, 1, 2, 3, 3.76, 4, 5, 5.33, 6 ]);
			tree.criteria = {
				isSameValue: ( v, { value }) => Math.floor( v ) === value || Math.ceil( v ) === value,
				isValueBefore: ( v, node ) => v > node.value
			};
			expect( tree.values ).toStrictEqual([ 6, 5, 4, 3, 2, 1, 0 ]);
			tree = null;
		});
		test( 'isValueBefore property changes', () => {
			let tree = new Tree<number>([ 3, 1, 5, 0, 6, 2, 4 ]);
			// numbers are sorted asc by default
			expect( tree.values ).toStrictEqual([ 0, 1, 2, 3, 4, 5, 6 ]);
			tree.isValueBefore = ( v, node ) => v > node.value;
			expect( tree.values ).toStrictEqual([ 6, 5, 4, 3, 2, 1, 0 ]);
			tree = null;
		});
		test( 'isSameValue property changes', () => {
			let tree = new Tree<number>([
				0, 1, 2, 3, 0, 4, 2, 5, 1, 6
			]);
			// numbers are sorted asc by default
			expect( tree.values ).toStrictEqual([ 0, 1, 2, 3, 4, 5, 6 ]);
			tree.isSameValue = v => ( v % 2 ) === 1;
			expect( tree.values ).toStrictEqual([ 0, 2, 4, 6 ]);
			tree = null;
		});
		describe( 'values property changes', () => {
			let tree : Tree<number>;
			beforeEach(() => { tree = new Tree([ 0, 1, 2, 3, 0, 4, 2, 5, 1, 6 ] )});
			afterEach(() => { tree = null })
			test( 'at initialization are automatically sorted and deduped', () => {
				expect( tree.values ).toStrictEqual([ 0, 1, 2, 3, 4, 5, 6 ]);
			});
			test( 'through the `set` property are automatically sorted and deduped', () => {
				tree.values = [ 30, 10, 50, 0, 60, 20, 40 ];
				expect( tree.values ).toStrictEqual([ 0, 10, 20, 30, 40, 50, 60 ]);
			});
			test( 'disassociate all previous undetached nodes', () => {
				const detachedNode = tree.getNodeAt( -1 ).detach();
				const oldNodes = [ ...tree.traverse() as Array<TreeNode<number>> ];
				expect( detachedNode.isFree ).toBe( false );
				expect( oldNodes.every( n => !n.isFree ) ).toBe( true );
				tree.values = [ 30, 10, 50, 0, 60, 20, 40 ];
				// detached node remains associated.
				expect( detachedNode.isFree ).toBe( false );
				// undetached nodes are disassociated.
				expect( oldNodes.every( n => n.isFree ) ).toBe( true );
			});
		});
		describe( 'ordered value inserts', () => {
			const testData = [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ];
			test( 'into an empty tree', () => {
				let tree = new Tree<number>();
				tree.insert( 30 );
				expect( tree.values ).toStrictEqual([ 30 ]);
				tree = null;
			});
			describe( 'with existing values', () => {
				test.concurrent.each( testData.map( d => [ d ] ) ) (
					'produces no effect. Inserting %d',
					async incomingValue => {
						let tree = new Tree<number>( testData );
						tree.insert( incomingValue );
						expect( tree.values ).toStrictEqual( testData );
						tree = null;
					} 
				);
			});
			describe( 'with values exceeding data boundaries', () => {
				test( 'prepends new minimum to the data set.', () => {
					let tree = new Tree<number>( testData );
					const treeValues = tree.values;
					tree.insert( -5 );
					expect( tree.values ).toStrictEqual([ -5, ...treeValues ]);
					tree = null;
				});
				test( 'appends new maximum to the data set.', () => {
					let tree = new Tree<number>( testData );
					const treeValues = tree.values;
					tree.insert( 1e6 );
					expect( tree.values ).toStrictEqual([ ...treeValues, 1e6 ]);
					tree = null;
				});
			});
			describe( 'with new in-range values', () => {
				test.concurrent.each([
					[ 1, [ 0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 5, [ 0, 2, 4, 5, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 11, [ 0, 2, 4, 8, 11, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 15, [ 0, 2, 4, 8, 15, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 17, [ 0, 2, 4, 8, 16, 17, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 23, [ 0, 2, 4, 8, 16, 23, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 24, [ 0, 2, 4, 8, 16, 24, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 25, [ 0, 2, 4, 8, 16, 25, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 31, [ 0, 2, 4, 8, 16, 31, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 43, [ 0, 2, 4, 8, 16, 32, 43, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 127, [ 0, 2, 4, 8, 16, 32, 64, 127, 128, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 129, [ 0, 2, 4, 8, 16, 32, 64, 128, 129, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 255, [ 0, 2, 4, 8, 16, 32, 64, 128, 255, 256, 512, 1024, 2048, 4096, 8192 ] ],
					[ 257, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 257, 512, 1024, 2048, 4096, 8192 ] ],
					[ 767, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 767, 1024, 2048, 4096, 8192 ] ],
					[ 768, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 768, 1024, 2048, 4096, 8192 ] ],
					[ 769, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 769, 1024, 2048, 4096, 8192 ] ],
					[ 2047, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2047, 2048, 4096, 8192 ] ],
					[ 2049, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 2049, 4096, 8192 ] ],
					[ 3393, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 3393, 4096, 8192 ] ],
					[ 4000, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4000, 4096, 8192 ] ],
					[ 4097, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 4097, 8192 ] ],
					[ 6044, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 6044, 8192 ] ],
					[ 6144, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 6144, 8192 ] ],
					[ 6327, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 6327, 8192 ] ],
					[ 6800, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 6800, 8192 ] ],
					[ 8191, [ 0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8191, 8192 ] ],
				])( 'placed between closest consescutive values. Inserting: %d',
					async ( incomingValue, expectedData ) => {
						let tree = new Tree<number>( testData );
						tree.insert( incomingValue );
						expect( tree.values ).toStrictEqual( expectedData );
						tree = null;
					}
				);
			} );
		} );
	} );
	describe( 'static methods', () => {
		describe( 'isValid(...)', () => {
			test( 'acknowledges a valid tree instance', () => {
				expect( Tree.isValid( new Tree() ) ).toBe( true );
			} );
			test( 'invalidate invalid tree tyype', () => {
				// @ts-ignore
				expect( Tree.isValid( new Object() ) ).toBe( false );
			} );
		} );
	} );
	describe( 'properties', () => {
		let isSameValue : Criterion<number>;
		let isValueBefore : Criterion<number>;
		let testValues : Array<number> = [ 1, 2, 3, 4, 5, 6, 7, 8 ];
		let tree : Tree<number>;
		beforeAll(() => {
			isSameValue = () => false;
			isValueBefore = () => false;
			tree = new Tree( testValues, { isSameValue, isValueBefore } );
		});
		afterAll(() => { tree = null });
		describe( 'getters', () => {
			test( 'isSameValue', () => {
				expect( tree.isSameValue ).toBe( isSameValue );
			} );
			test( 'isValueBefore', () => {
				expect( tree.isValueBefore ).toBe( isValueBefore );
			} );
			test( 'size', () => {
				expect( tree.size ).toBe( testValues.length );
			} );
			test( 'values', () => {
				expect( tree.values ).toStrictEqual( testValues );
			} );
		} );
		describe( 'setters', () => {
			describe( 'criteria', () => {
				let testValues : Array<number>;
				let tree : Tree<number>;
				beforeAll(() => {
					testValues = [ -24, -18, -12, -6, 0, 12, 46, 78, 94, 100 ];
					tree = new Tree( testValues );
				});
				afterAll(() => { testValues = tree = null });
				describe( '***', () => {
					let tree : Tree<number>;
					let cOpts : TreeOptions<number>;
					beforeAll(() => {
						tree = new Tree( testValues );
						cOpts = {
							isSameValue: ( v, n ) => v === n.value,
							isValueBefore: ( v, n ) => v < n.value
						};
						tree.criteria = cOpts;
					});
					afterAll(() => { cOpts = tree = null });
					test( 'sets `isSameValue` properties', () => {
						expect( tree.isSameValue ).toBe( cOpts.isSameValue );
					} );
					test( 'sets `isValueBefore` properties', () => {
						expect( tree.isValueBefore ).toBe( cOpts.isValueBefore );
					} );
				} );
				describe( 'when set to undefined', () => {
					let changedInitCriteriaToDefaults : boolean;
					beforeAll(() => {
						let initialOpts : TreeOptions<number> = {
							isSameValue: ( v, n ) => v === n.value,
							isValueBefore: ( v, n ) => v < n.value
						};
						let tree = new Tree<number>( testValues, initialOpts );
						changedInitCriteriaToDefaults = (
							tree.isSameValue === initialOpts.isSameValue &&
							tree.isValueBefore === initialOpts.isValueBefore
						);
						if( !changedInitCriteriaToDefaults ) {
							initialOpts = tree = null;
							return;
						}
						tree.criteria = undefined;
						changedInitCriteriaToDefaults = (
							tree.isSameValue !== initialOpts.isSameValue &&
							tree.isSameValue === Tree.DEFAULT &&
							tree.isValueBefore !== initialOpts.isValueBefore &&
							tree.isValueBefore === Tree.DEFAULT
						);
						initialOpts = tree = null;
					} );
					test( 'sets `isSameValue` properties to default fn', () => {
						expect( changedInitCriteriaToDefaults ).toBe( true );
					} );
					test( 'sets `isValueBefore` properties to default fn', () => {
						expect( changedInitCriteriaToDefaults ).toBe( true );
					} );
				} );
				describe( 'automatically rebalances the tree', () => {
					test( 'to match the new criteria', () => {
						let tree = new Tree<number>( testValues );
						expect( tree.values ).toStrictEqual( testValues );
						// use the reversed `isValueBefore` comparer
						// in to reverse the tree values ordering
						tree.criteria = { isValueBefore: ( v, n ) => v > n.value }
						expect( tree.values ).toStrictEqual([ ...testValues ].reverse() );
					} );
				} );
				describe( 'when set with any non-function criteria member', () => {
					let tree : Tree<number>;
					beforeAll(() => { tree = new Tree<number>() });
					afterAll(() => { tree = null });
					test( 'throws on invalid `isSameValue` param property', () => {
						const opts : TreeOptions<number> = { isSameValue: null };
						expect(() => { tree.criteria = opts }).toThrow( TypeError );
						expect(() => { tree.criteria = opts }).toThrow(
							'Invalid attempt to set tree\'s "isSameValue" property. Either unset it or set to either a function or Tree.DEFAULT.'
						);
					} );
					test( 'throws on invalid `isValueBefore` param property', () => {
						const opts : TreeOptions<number> = { isValueBefore: null };
						expect(() => { tree.criteria = opts }).toThrow( TypeError );
						expect(() => { tree.criteria = opts }).toThrow(
							'Invalid attempt to set tree\'s "isValueBefore" property. Either unset it or set to either a function or Tree.DEFAULT.'
						);
					} );
					test( 'attempt to set a criteria member to undefined resets the member to its default tag', () => {
						const isSameValue : Criterion<number> = () => false;
						const tree = new Tree([ 1, 2, 3 ], { isSameValue });
						expect( tree.isSameValue ).toBe( isSameValue );
						tree.criteria = { isSameValue: undefined };
						expect( tree.isSameValue ).not.toBeUndefined();
						expect( tree.isSameValue ).not.toBe( isSameValue );
						expect( tree.isSameValue ).toEqual( Tree.DEFAULT );
					} );
					test( 'coverage test: attempt to set a criteria member to itself remains unchanged', () => {
						const isSameValue = () => false;
						const tree = new Tree([ 1, 2, 3 ], { isSameValue });
						expect( tree.isSameValue ).toBe( isSameValue );
						tree.criteria = { isSameValue };
						expect( tree.isSameValue ).toBe( isSameValue );
					} );
				} );
			} );
			describe( 'criteria members', () => {
				let criteriaSetterSpy : jest.SpyInstance<void, [ CriteriaOptions<number> ]>;
				let testFn : Criterion<number>;
				beforeAll(() => {
					criteriaSetterSpy = jest.spyOn( tree, 'criteria', 'set' );
					testFn = () => true;
				});
				afterEach(() => { criteriaSetterSpy.mockClear() });
				afterAll(() => {
					criteriaSetterSpy.mockRestore()
					criteriaSetterSpy = null;
					testFn = null;
				});
				describe( 'isSameValue', () => {
					test( 'sets via the criteria setter property', () => {
						tree.isSameValue = testFn;
						expect( criteriaSetterSpy ).toHaveBeenCalledTimes( 1 );
						expect( criteriaSetterSpy ).toHaveBeenCalledWith(
							expect.objectContaining({ isSameValue: testFn })
						);
					} );
					describe( 'on receiving `undefined` input', () => {
						test( 'sends the default text to the criteria setter property', () => {
							tree.isSameValue = undefined;
							expect( criteriaSetterSpy ).toHaveBeenCalledWith(
								expect.objectContaining({ isSameValue: Tree.DEFAULT })
							);
						} );
					} );
				} );
				describe( 'isValueBefore', () => {
					test( 'sets via the criteria setter property', () => {
						tree.isValueBefore = testFn;
						expect( criteriaSetterSpy ).toHaveBeenCalledTimes( 1 );
						expect( criteriaSetterSpy ).toHaveBeenCalledWith(
							expect.objectContaining({ isValueBefore: testFn })
						);
					} );
					describe( 'on receiving `undefined` input', () => {
						test( 'sends the default text to the criteria setter property', () => {
							criteriaSetterSpy.mockClear();
							tree.isValueBefore = undefined;
							expect( criteriaSetterSpy ).toHaveBeenCalledWith(
								expect.objectContaining({ isValueBefore: Tree.DEFAULT })
							);
						} );
					} );
				} );
			} );
			describe( 'values', () => {
				describe( 'accept any iterable type', () => {
					class TestIterable {
						private _data = [];
						constructor( ...data ) { this._data = data }
						[ Symbol.iterator ]() {
							let index = 0;
							return {
								next: () => index < this._data.length
									? { value: this._data[ index++ ], done: false }
									: { done: true }
							};
						}
					}
					let tree = new Tree();
					const itMessage = 'Can only set values property to either an array or undefined.'
					const getTester = data => () => {
						let hasItError = false;
						try { tree.values = data } catch( e ) {
							hasItError = e.constructor.name === 'TypeError' && e.message === itMessage;
						}
						expect( hasItError ).toBe( false );
						expect( hasItError ).toBe( false );
					}
					test( 'with Array', getTester( testValues ) );
					test( 'with String', getTester( testValues.join() ) );
					test( 'with TestIterable', getTester( new TestIterable( ...testValues ) ) );
					test( 'with Set', getTester( new Set( testValues ) ) );
					test( 'with Map', getTester( new Map(
						testValues.map( ( v, i ) => [ i, v ] )
					) ) );
				} );
				describe( 'data management', () => {
					let managed = false;
					beforeAll(() => {
						tree = new Tree();
						if( !![ ...tree.values ].length ) {
							tree = null;
							return;
						}
						tree.values = [ 0, 11, 0, 77, 11, 33, 0, 99, 55 ];
						const expecteds = [ 0, 11, 33, 55, 77, 99 ]
						managed = [ ...tree.values ].every(( v, i ) => v === expecteds[ i ]);
					});
					test( 'sorts values ', () => { expect( managed ).toBe( true ) } );
					test( 'dedupes values ', () => { expect( managed ).toBe( true ) } );
				} );
				test( 'throws on non-iterable input', () => {
					// @ts-ignore
					expect(() => { tree.values = 99 }).toThrow( TypeError );
					// @ts-ignore
					expect(() => { tree.values = 99 }).toThrow(
						'Can only set values property using an iterable or (falsy values for an empty tree).'
					);
				} );
				test( 'clears the tree on empty iterable input', () => {
					let tree = new Tree( testValues );
					expect( tree.values ).toStrictEqual( testValues );
					tree.values = [];
					expect( tree.values ).toHaveLength( 0 );
				} );
				test( 'clears the tree with the undefined input', () => {
					let tree = new Tree( testValues );
					expect( tree.values ).toStrictEqual( testValues );
					tree.values = undefined;
					expect( tree.values ).toHaveLength( 0 );
				} );
				test( 'changes tree values', () => {
					let tree = new Tree( testValues );
					expect( tree.values ).toStrictEqual( testValues );
					const newValues = [ 1, 3, 6, 9 ];
					tree.values = newValues;
					expect( tree.values ).toStrictEqual( newValues );
					tree.values = [ 1, 3, 6, 9, 10, 30, 60, 90, 11, 33, 66, 99 ];
					expect( tree.values ).toStrictEqual([
						1, 3, 6, 9, 10, 11, 30, 33, 60, 66, 90, 99
					]);
				} );
			} );
		} );
	} );
	describe( 'instance methods', () => {
		describe( 'cleanup(...)', () => {
			let nodesNotFreedBeforeDetachment : boolean;
			let nodesFreedAfterDetachment : boolean;
			beforeAll(() => {
				let tree = new Tree([ 1, 2, 3, 4 ]);
				const detachedNodes = [ 0, 2, 3 ].map( index => tree.getNodeAt( index ) );
				// running cleanup on a tree with no detached nodes has no effect
				tree.cleanup();
				nodesNotFreedBeforeDetachment = detachedNodes.every( n => !n.isFree );
				// running cleanup on a tree with detached nodes; frees up the detached nodes
				detachedNodes.map( n => n.detach() );
				tree.cleanup();
				nodesFreedAfterDetachment = detachedNodes.every( n => n.isFree );
				tree = null;
			});
			test( 'removes all association with this tree and its detached nodes', () => {
				expect( nodesFreedAfterDetachment ).toBe( true )
			} );
			test( 'running cleanup on a tree with no detached nodes has no effect', () => {
				expect( nodesNotFreedBeforeDetachment ).toBe( true );
			} );
			test( 'returns self', () => {
				const tree = new Tree();
				expect( tree.cleanup() ).toBe( tree );
			} );
		} );
		describe( 'clear(...)', () => {
			let tree : Tree<number>;
			const values = [ 1, 2, 3, 4 ];
			beforeEach(() => { tree = new Tree( values ) });
			afterEach(() => { tree = null });
			test( 'discards all data', () => {
				expect( tree.size ).toBe( values.length );
				tree.clear();
				expect( tree.size ).toBe( 0 );
			} );
			test( 'returns self', () => {
				expect( tree.clear() ).toBe( tree );
			} );
		} );
		describe( 'compare(...)', () => {
			let node : TreeNode<number>;
			let testValue : number;
			let tree : Tree<number>;
			beforeAll(() => {
				testValue = 3;
				tree = new Tree([ testValue ]);
				node = ( tree.traverse() as Array<TreeNode<number>> ).pop();

			})
			afterAll(() => { testValue = tree = node = null });
			test( 'returns -1 when value is less than node.value', () => {
				expect( tree.compare( 0, node ) ).toBe( -1 );
			} );
			test( 'returns 0 when value equals node.value', () => {
				expect( tree.compare( testValue, node ) ).toBe( 0 );
			} );
			test( 'returns 1 when value is greater than node.value', () => {
				expect( tree.compare( 5, node ) ).toBe( 1 );
			} );
			test( 'uses supplied isSameValue and isValueBefore callbacks', () => {
				const isSameValue = jest
					.fn()
					.mockImplementation( ( v, n ) => v === n?.value );
				const isValueBefore = jest.fn().mockReturnValue( true );
				let tree = new Tree<number>(
					[ testValue ], { isSameValue, isValueBefore }
				);
				isSameValue.mockClear();
				isValueBefore.mockClear();
				tree.compare( 5, tree.getNodeAt( -1  ) );
				expect( isSameValue ).toHaveBeenCalled();
				expect( isValueBefore ).toHaveBeenCalled();
				tree = null;
			} );
			test( 'throws on receiving invalid node', () => {
				let tree = new Tree<number>();
				// @ts-ignore
				expect(() => { tree.compare( 5, { value: 2 } ) }).toThrow( TypeError );
				tree = null;
			} );
		} );
		describe( '*genTraversal(...)', () => {
			const testValues = [ 1, 2, 3, 4, 5, 6, 7 ];
			const expectedLtrPostOrderResult = [ 1, 3, 2, 5, 7, 6, 4 ];
			const expectedLtrPreOrderResult = [ 4, 2, 1, 3, 6, 5, 7 ];
			const expectedRtlPostOrderResult = [ 7, 5, 6, 3, 1, 2, 4 ];
			const expectedRtlPreOrderResult = [ 4, 6, 7, 5, 2, 3, 1 ];
			let tree = new Tree( testValues );
			describe( 'default behavior', () => {
				let isInOrder = true;
				beforeAll(() => {
					let i = 0;
					for( const { value } of tree.genTraversal() ) {
						if( value !== testValues[ i ] ) {
							isInOrder = false;
							break;
						}
						i++;
					}
				});
				test( 'uses In-Order traversal', () => { expect( isInOrder ).toBe( true ) } );
				test( 'traverses from letf to right', () => { expect( isInOrder ).toBe( true ) } );
				test( 'accesses all nodes', () => { expect( isInOrder ).toBe( true ) } );
				test( 'terminates immediately on tree with null root', () => {
					const tree = new Tree<number>();
					const generator = tree.genTraversal();
					expect( generator.next() ).toStrictEqual({
						done: true,
						value: undefined
					});
				} );
			} );
			describe( 'acceptable traversal order', () => {
				test.each([
					[ TraversalOrder.IN, testValues ],
					[ TraversalOrder.POST, expectedLtrPostOrderResult ],
					[ TraversalOrder.PRE, expectedLtrPreOrderResult ]
				])(
					'retrieves values accordingly. Traversing in %s order',
					( order, expectedData ) => {
						let i = 0;
						for( const { value } of tree.genTraversal({ order }) ) {
							if( value !== expectedData[ i ] ) { break }
							i++;
						}
						expect( i ).toBe( testValues.length );
					}
				);
			} );
			describe( 'acceptable traversal direction', () => {
				test.each([
					[ TraversalOrder.IN, TraversalDirection.RIGHT, testValues ],
					[ TraversalOrder.IN, TraversalDirection.LEFT, [ ...testValues ].reverse() ],
					[ TraversalOrder.POST, TraversalDirection.RIGHT, expectedLtrPostOrderResult ],
					[ TraversalOrder.POST, TraversalDirection.LEFT, expectedRtlPostOrderResult ],
					[ TraversalOrder.PRE, TraversalDirection.RIGHT, expectedLtrPreOrderResult ],
					[ TraversalOrder.PRE, TraversalDirection.LEFT, expectedRtlPreOrderResult ]
				])(
					'retrieves values accordingly. Traversing in %s order to the $s direction',
					( order, direction, expectedData ) => {
						let i = 0;
						for( const { value } of tree.genTraversal({ direction, order }) ) {
							if( value !== expectedData[ i ] ) { break }
							i++;
						}
						expect( i ).toBe( testValues.length );
					}
				);
			} );
			describe( 'range based traversal', () => {
				const testArtifacts = [
					[ TraversalOrder.IN, TraversalDirection.RIGHT, [ 3, 4, 5 ] ],
					[ TraversalOrder.IN, TraversalDirection.LEFT, [ 3, 2, 1 ] ],
					[ TraversalOrder.POST, TraversalDirection.RIGHT, [ 3, 2, 5 ] ],
					[ TraversalOrder.POST, TraversalDirection.LEFT, [ 3, 1, 2 ] ],
					[ TraversalOrder.PRE, TraversalDirection.RIGHT, [ 3, 6, 5] ],
					[ TraversalOrder.PRE, TraversalDirection.LEFT, [ 3, 1 ] ]
				];
				const runTest = ( range : {
					maxLength: number;
					start: number
				} ) => {
					test.each( testArtifacts )(
						'retrieves values accordingly. Traversing in %s order to the %s direction',
						( 
							order : TraversalOrder,
							direction : TraversalDirection,
							expectedData : Array<number>
						) => {
							let i = 0;
							for( const { value } of tree.genTraversal({ direction, order, ...range } ) ) {
								if( value !== expectedData[ i ] ) { break }
								i++;
							}
							expect( i ).toBe( expectedData.length );
						}
					);
				};
				describe(
					'using normal start index option',
					() => { runTest({ start: 2, maxLength: 3 }) }
				);
				describe(
					'assigning start index value by counting backwards',
					() => { runTest({ start: -5 , maxLength: 3 }) }
				);
			} );
			describe( 'out of bound range traversal scenario', () => {
				const testArtifacts = [
					[ TraversalOrder.IN, TraversalDirection.RIGHT, testValues ],
					[ TraversalOrder.IN, TraversalDirection.LEFT, [ ...testValues ].reverse() ],
					[ TraversalOrder.POST, TraversalDirection.RIGHT, expectedLtrPostOrderResult ],
					[ TraversalOrder.POST, TraversalDirection.LEFT, expectedRtlPostOrderResult ],
					[ TraversalOrder.PRE, TraversalDirection.RIGHT, expectedLtrPreOrderResult ],
					[ TraversalOrder.PRE, TraversalDirection.LEFT, expectedRtlPreOrderResult ]
				];
				const getSingleTest = range => ( order, direction, expectedData ) => {
					let i = 0;
					for( const { value } of tree.genTraversal({ direction, order, ...range }) ) {
						if( value !== expectedData[ i ] ) { break }
						i++;
					}
					expect( i ).toBe( expectedData.length );
				}
				const runTest = range => {
					test.each( testArtifacts )(
						'retrieves values from default start index. Traversing in %s order to the %s direction',
						getSingleTest( range )
					);
				};
				describe(
					'start index counting backwards',
					() => { runTest({ start: -23 }) }
				);
				describe(
					'start index exceeding available nodes',
					() => { runTest({ start: 15 }) }
				);
				describe(
					'in-range maxLength between -1 and start in IN_ORDER right-to-left direction',
					() => {
						test( 'backwardly retrieves all matching nodes from start to index at maxLength', () => {
							getSingleTest({ maxLength: 5, start: 6 })(
								// @ts-ignore
								...testArtifacts[ 1 ].slice( 0, -1 ),
								testArtifacts[ 1 ][ 2 ].slice( 0, -1 )
							);
						} );
					}
				);
				describe( 'maxLength = 0', () => {
					test.each( testArtifacts )(
						`retrieves 0 nodes with %s in the %s direction`, (
							order : TraversalOrder,
							direction : TraversalDirection
						) => {
							const nodes = [];
							for( const node of tree.genTraversal({
								direction, order, maxLength: 0
							}) ) { nodes.push( node ) }
							expect( nodes ).toHaveLength( 0 );
						}
					)
				} );
			} );
			test( 'throws Error on invalid traversal order', () => {
				// @ts-ignore
				const t = () => { tree.genTraversal({ order: 'testing' }).next() };
				expect( t ).toThrow( Error );
				expect( t ).toThrow( 'Unknown order detected. Member of the `TraversalOrder` expected or leave it unset.' );
			} );
			test( 'throws Error on invalid traversal direction', () => {
				// @ts-ignore
				const t = () => { tree.genTraversal({ direction: 'testing' }).next() };
				expect( t ).toThrow( Error );
				expect( t ).toThrow( 'Invalid `direction` option supplied to `traverse` method. A member of `TraversalDirection` expected or leave it unset.' );
			} );
			test( 'throws TypeError on invalid traversal maxLength', () => {
				const t = () => { tree.genTraversal({ maxLength: null }).next() };
				expect( t ).toThrow( TypeError );
				expect( t ).toThrow( 'Invalid `maxLength` option supplied to `traverse` method. Integer expected or leave it unset.' );
			} );
			test( 'throws TypeError on invalid traversal start node index', () => {
				const t = () => { tree.genTraversal({ start: null }).next() };
				expect( t ).toThrow( TypeError );
				expect( t ).toThrow( 'Invalid `start node index` option supplied to `traverse` method. Integer expected or leave it unset.' );
			} );
			describe( 'suplemental coverage testing', () => {
				const testValues = [ 0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192 ];
				const tree = new Tree( testValues );
				const runTestFor = baseOpts => {
					describe( 'ltr', () => {
						const opts = { ...baseOpts, direction: TraversalDirection.RIGHT };
						test.each( testValues.map(( v, i ) => [ i, v ]) )(
							`starting from index %i = %i`,
							( start, sValue ) => {
								for( const i of tree.genTraversal({ ...opts, start }) ) {}
								expect( true ).toBe( true );
							}
						);
					} );
					describe( 'rtl', () => {
						const opts = { ...baseOpts, direction: TraversalDirection.LEFT };
						test.each( testValues.map(( v, i ) => [ i, v ]) )(
							`starting from index %i = %i`,
							( start, sValue ) => {
								for( const i of tree.genTraversal({ ...opts, start }) ) {}
								expect( true ).toBe( true );
							}
						);
					} );
				};
				describe( 'in-order', () => { runTestFor({ order: TraversalOrder.IN }) } );
				describe( 'post-order', () => { runTestFor({ order: TraversalOrder.POST }) } );
				describe( 'pre-order', () => { runTestFor({ order: TraversalOrder.PRE }) } );
			} );
		} );
		describe( 'getNodeAt(...)', () => {
			let testValues = [ 1, 2, 3, 4, 5, 6, 7 ];
			let tree = new Tree( testValues );
			test.each( testValues.map(( v, i ) => [ i ]) )(
				'returns node at index %i', index => {
				expect( tree.getNodeAt( index ).value ).toBe( testValues[ index ] );
			} );
			test( 'counts right to left with negative indexing', () => {
				expect( tree.getNodeAt( -1 ).value ).toBe( testValues[ testValues.length - 1 ]);
			} );
			test( 'returns undefined for out of bound index', () => {
				expect( tree.getNodeAt( 100 ) ).toBeUndefined();
			} );
		} );
		describe( 'indexOf(...)', () => {
			let testValues = [ 1, 2, 3, 4, 5, 6, 7 ];
			let tree = new Tree( testValues );
			test( 'returns -1 when used on an empty tree', () => {
				expect(( new Tree() ).indexOf( 2 )).toBe( -1 );
			} );
			test.each( testValues.map( v => [ v ] ) )(
				'returns index location of the node holding the value %i', value => {
				expect( tree.indexOf( value ) ).toBe( testValues.indexOf( value ) );
			} );
			test( 'returns index location of the node in tree section with the searched value', () => {
				expect( tree.indexOf( 6, 3, 5 ) ).toBe( testValues.indexOf( 6 ) );
			} );
			test( 'search ranges from start index to the end of tree when end param exceeds available tree nodes', () => {
				// searches all nodes to find node[5].value = 6
				expect( tree.indexOf( 6 ) ).toBe( 5 );
				// searches all nodes starting from index #4 to find node[5].value = 6
				expect( tree.indexOf( 6, 4 ) ).toBe( 5 );
				// searches all node from index #4 to the last index to find node[5].value = 6
				expect( tree.indexOf( 6, 4, tree.size - 1 ) ).toBe( 5 );
				// *** exceeding end index *** searches all node from index #4 to the last index to find node[5].value = 6
				expect( tree.indexOf( 6, 4, 55 ) ).toBe( 5 );
			} );
			test( 'returns -1 when no node in tree section with the searched value', () => {
				expect( tree.indexOf( 2, 3, 5 ) ).toBe( -1 );
			} );
			test( 'returns -1 when start index exceeds the available tree nodes', () => {
				// confirms value presence in the tree
				expect( tree.indexOf( 3 ) ).toBe( 2 );
				// confirms unreachability with the excessive start index
				expect( tree.indexOf( 3, tree.size ) ).toBe( -1 );
			} );
			test( 'returns -1 when no node in tree with the searched value', () => {
				expect( tree.indexOf( 44 ) ).toBe( -1 );
			} );
			describe( 'using negative range values', () => {
				test( 'returns index when found search value in range with a negative start index', () => {
					// deliberately using search value = 3 located at start index #2
					expect( tree.indexOf( 3, -5 ) ).toBe( 2 );
					// deliberately using search value = 1 located at index #0
					expect( tree.indexOf( 1, -5 ) ).toBe( -1 );
				} );
				test( 'search ranges from start index to negative end index', () => {
					// searching range indexes = {3, 5} 
					expect( tree.indexOf( 7, 3, -2 ) ).toBe( -1 ); // index #6 is out of range
					expect( tree.indexOf( 6, 3, -2 ) ).toBe( 5 );
					expect( tree.indexOf( 4, -4, -2 ) ).toBe( 3 );
				} );
				test( 'starts search from index #0 when encountering excessive negative start index', () => {
					expect( tree.indexOf( 4, -4, 4 ) ).toBe( 3 ); // range: {3, 4}
					expect( tree.indexOf( 4, -300, 4 ) ).toBe( 3 ); // range: {0, 4}
					expect( tree.indexOf( 6, -24, 4 ) ).toBe( -1 ); // range: {0, 4} *index #5 = 6
					expect( tree.indexOf( 1, -128, 1 ) ).toBe( 0 ); // range: {0, 1}
					expect( tree.indexOf( 2, -128, 1 ) ).toBe( 1 ); // range: {0, 1}
					expect( tree.indexOf( 3, -128, 1 ) ).toBe( -1 ); // range: {0, 1} *index #2 = 3
				} );
				test( 'limits search range to start index along when encountering excessive negative end index', () => {
					// searching range indexes = {3} 
					expect( tree.indexOf( 7, 3, -300 ) ).toBe( -1 ); // index #6 is out of range
					expect( tree.indexOf( 6, 3, -24 ) ).toBe( -1 );
					expect( tree.indexOf( 4, -4, -128 ) ).toBe( 3 ); // index #3 = 4 
				} );
			} );
		} );
		describe( 'insert(...)', () => {
			let tree : Tree<number>;
			beforeEach(() => { tree = new Tree([ 1, 6, 10 ]) });
			afterEach(() => { tree = null });
			test( 'returns the tree', () => { expect( tree.insert( 4 ) ).toBe( tree ) } );
			test( 'inserts in sorted and unique', () => {
				tree.insert( 4 ).insert( 12 ).insert( 7 ).insert( 10 ).insert( -33 ).insert( 9 );
				expect( tree.values ).toStrictEqual([ -33, 1, 4, 6, 7, 9, 10, 12 ]);
			} );
		} );
		describe( 'insertNode(...)', () => {
			let testValues : Array<number>;
			let tree : Tree<number>;
			beforeEach(() => { 
				testValues = [ 1, 6, 10 ];
				tree = new Tree( testValues );
			});
			afterEach(() => { testValues = tree = null });
			describe( '***', () => {
				let returnedSelf, isDetachedChangedToFalse = false;
				beforeAll(() => {
					let tree = new Tree([ 1, 6, 10 ]);
					const detachedNode = tree.getNodeAt( 1 ).detach();
					if( !detachedNode.isDetached ) {
						tree = null;
						return;
					}
					returnedSelf = tree.insertNode( detachedNode ) === tree;
					isDetachedChangedToFalse = !detachedNode.isDetached;
					tree = null;
				});
				test( 'returns the tree', () => { expect( returnedSelf ).toBe( true ) });
				test( 're-inserts detached node belonging to this tree', () => {
					expect( isDetachedChangedToFalse ).toBe( true );
				});
			} );
			test( 'adjusts outdated node index property', () => {
				let tree = new Tree( testValues );
				const origNode2 = tree.getNodeAt( 2 ).detach();
				expect( tree.getNodeAt( 2 ) ).toBeUndefined();
				expect({
					index: origNode2.index,
					isDetached: origNode2.isDetached,
					value: origNode2.value
				}).toEqual(
					expect.objectContaining({
						index: 2,
						isDetached: true,
						value: testValues[ 2 ]
					})
				);
				tree.insert( 8 ); // takes the index #2;
				const newNode2 = tree.getNodeAt( 2 );
				expect({
					index: newNode2.index,
					isDetached: newNode2.isDetached,
					value: newNode2.value
				}).toEqual(
					expect.objectContaining({
						index: 2,
						isDetached: false,
						value: 8
					})
				);
				tree.insertNode( origNode2 );
				expect({
					index: origNode2.index,
					isDetached: origNode2.isDetached,
					value: origNode2.value
				}).toEqual(
					expect.objectContaining({
						index: 3,
						isDetached: false,
						value: testValues[ 2 ]
					})
				);
				tree = null;
			} );
			test( 'ignores attempt to re-insert an undetached node', () => {
				const childNode = tree.getNodeAt( 1 );
				const nodeJoinSpy = jest.spyOn( childNode, 'join' );
				tree.insertNode( childNode );
				expect( nodeJoinSpy ).not.toHaveBeenCalled();
			} );
			test( 'accepts unassoicated node', () => {
				let tree = new Tree(  testValues );
				const freeNode = tree.getNodeAt( 1 ).free();
				expect([ ...tree.values ].indexOf( freeNode.value )).toBe( -1 );
				expect( freeNode.isDetached ).toBe( true );
				expect( freeNode.isFree ).toBe( true );
				try { freeNode.join() } catch( e ) {
					expect([ ...tree.values ].indexOf( freeNode.value )).toBe( -1 );
					expect( e ).toBeInstanceOf( ReferenceError );
					expect( e.message ).toBe( 'Cannot join node. Referenced tree does not exist.' );
				}
				expect(() => tree.insertNode( freeNode )).not.toThrow();
				expect([ ...tree.values ].indexOf( freeNode.value )).not.toBe( -1 );
				tree = null;
			} );
			describe( 'Argument validation', () => {
				test( 'throws TypeError on attempt to insert invalid node', () => {
					const node = { value: expect.any( Number ), left: null, right: null }
					// @ts-ignore
					expect(() => { tree.insertNode( node ) }).toThrow( TypeError );
					// @ts-ignore
					expect(() => { tree.insertNode( node ) }).toThrow( Tree.INVALID_NODE_MESSAGE );
				} );
				test( 'throws ReferenceError on attempt to insert foreign node instances', () => {
					let testTree = new Tree([ 90 ]);
					const node = testTree.getNodeAt( 0 );
					expect(() => { tree.insertNode( node ) }).toThrow( ReferenceError );
					expect(() => { tree.insertNode( node ) }).toThrow( Tree.TREE_MISMATCH_MESSAGE );
					testTree = null;
				} );
			} );
		} );
		describe( 'remove(...)', () => {
			let testValues = [ 0, 3, 6, 9 ];
			let tree = new Tree( testValues );
			describe( '***', () => {
				const t = tree.remove( 2 );
				test( 'returns self', () => { expect( t ).toBe( tree ) } );
				test( 'has no effect if not found in tree', () => {
					expect( t.values ).toStrictEqual( testValues );
				} );
			} );
			test( 'attempt to remove node by value from an empty tree is a no op', () => {
				const tree = new Tree();
				let treeIndexOfSpy = jest.spyOn( tree, 'indexOf' );
				tree.remove( 99 );
				expect( treeIndexOfSpy ).not.toHaveBeenCalled();
				treeIndexOfSpy.mockRestore();
			} );
			test( 'removes & dissociates only nodes on tree matching values', () => {
				expect( tree.values ).toStrictEqual([ 0, 3, 6, 9 ]);
				/* ------------------------------------------------ */
				const detachedNode = tree.getNodeAt( 1 ).detach(); // v = 3
				expect( tree.values ).toStrictEqual([ 0, 6, 9 ]);
				const node0 = tree.getNodeAt( 0 ); // v = 0
				const node1 = tree.getNodeAt( 1 ); // v = 6
				/* ------------------------------------------------ */
				expect( detachedNode.isFree ).toBe( false );
				expect( node0.isFree ).toBe( false );
				expect( node1.isFree ).toBe( false );
				/* ------------------------------------------------ */
				tree.remove( 0 ).remove( 3 ).remove( 6 );
				expect( detachedNode.isFree ).toBe( false );
				expect( node0.isFree ).toBe( true );
				expect( node1.isFree ).toBe( true );
				/* ------------------------------------------------ */
				expect( tree.values ).toStrictEqual([ 9 ])
			} );
		} );
		describe( 'removeNode(...)', () => {
			describe( '***', () => {
				test( 'returns self', () => {
					let tree = new Tree([ 72 ]);
					expect( tree.removeNode( tree.getNodeAt( 0 ) )  ).toBe( tree );
				} );
			} );
			test( 'disassociates any node if associated with this tree', () => {
				let tree = new Tree([ 0, 3, 6, 9, 12 ]);
				let testNode0 = tree.getNodeAt( 0 );
				let testNode2 = tree.getNodeAt( 2 );
				let detachedNode = tree.getNodeAt( 4 ).detach();
				let node0FreeSpy = jest.spyOn( testNode0, 'free' );
				let node2FreeSpy = jest.spyOn( testNode2, 'free' );
				let detachedNodeFreeSpy = jest.spyOn( detachedNode, 'free' );
				tree
					.removeNode( testNode0 )
					.removeNode( testNode2 )
					.removeNode( detachedNode );
				expect( node0FreeSpy ).toHaveBeenCalledTimes( 1 );
				expect( node2FreeSpy ).toHaveBeenCalledTimes( 1 );
				expect( detachedNodeFreeSpy ).toHaveBeenCalledTimes( 1 );
				expect( tree.values ).toStrictEqual([ 3, 9 ]);
				node0FreeSpy.mockRestore();
				node2FreeSpy.mockRestore();
				detachedNodeFreeSpy.mockRestore();
				node0FreeSpy = node2FreeSpy = detachedNodeFreeSpy = null;
				testNode0 = testNode2 = detachedNode = tree = null;
			} );
		} );
		describe( 'rotate(...)', () => {
			test( 'is automatically scheduled on writes', () => {
				setTimeoutSpy.mockClear();
				let tree = new Tree([{ a: -4 }, { a: 6 }, { a: 0 }, { a: 9 }], {
					isSameValue: ( v, n ) => v.a === n.value.a,
					isValueBefore: ( v, n ) => v.a < n.value.a
				} );
				let treeRotateSpy = jest.spyOn( tree, 'rotate' );

				expect( setTimeoutSpy ).toHaveBeenCalled();
				expect( treeRotateSpy ).not.toHaveBeenCalled();
				jest.runOnlyPendingTimers();
				expect( treeRotateSpy ).toHaveBeenCalled();
				setTimeoutSpy.mockClear();
				treeRotateSpy.mockClear();
				tree.values = [{ a: 5 }, { a: 32 }, { a: 66 }, { a: 1 }];
				expect( treeRotateSpy ).not.toHaveBeenCalled();
				expect( setTimeoutSpy ).toHaveBeenCalled();
				jest.runOnlyPendingTimers();
				expect( treeRotateSpy ).toHaveBeenCalled();
				
				const oldNode2 = tree.getNodeAt( 2 );
				// @ts-ignore
				setTimeoutSpy.mockClear();
				treeRotateSpy.mockClear();
				oldNode2.value = { a: 72 };
				expect( treeRotateSpy ).not.toHaveBeenCalled();
				expect( setTimeoutSpy ).toHaveBeenCalled();
				jest.runOnlyPendingTimers();
				expect( treeRotateSpy ).toHaveBeenCalled();
				// @ts-ignore
				setTimeoutSpy.mockClear();
				treeRotateSpy.mockClear();
				tree.removeNode( oldNode2 );
				expect( treeRotateSpy ).not.toHaveBeenCalled();
				expect( setTimeoutSpy ).toHaveBeenCalled();
				jest.runOnlyPendingTimers();
				expect( treeRotateSpy ).toHaveBeenCalled();
				// @ts-ignore
				setTimeoutSpy.mockClear();
				treeRotateSpy.mockClear();
				tree.insertNode( oldNode2 );
				expect( treeRotateSpy ).not.toHaveBeenCalled();
				expect( setTimeoutSpy ).toHaveBeenCalled();
				jest.runOnlyPendingTimers();
				expect( treeRotateSpy ).toHaveBeenCalled();

				// @ts-ignore
				setTimeoutSpy.mockClear();
				treeRotateSpy.mockClear();
				oldNode2.value.a = 24;
				tree.synchronize( oldNode2 );
				expect( treeRotateSpy ).not.toHaveBeenCalled();
				expect( setTimeoutSpy ).toHaveBeenCalled();
				jest.runOnlyPendingTimers();
				expect( treeRotateSpy ).toHaveBeenCalled();

				treeRotateSpy.mockRestore();
				treeRotateSpy = tree = null;
			} );
			test( 'no automatic scheduling on writes attempts producing no new changes', () => {
				let testValues = [{ a: -2 }, { a: 3 }, { a: 0 }, { a: 9 }];
				let tree = new Tree( testValues, {
					isSameValue: ( v, n ) => v.a === n.value.a,
					isValueBefore: ( v, n ) => v.a < n.value.a
				} );
				let treeRotateSpy = jest.spyOn( tree, 'rotate' );
				jest.runOnlyPendingTimers();
				// @ts-ignore
				setTimeoutSpy.mockClear();
				treeRotateSpy.mockClear();
				
				tree.values = [ ...testValues ];
				expect( setTimeoutSpy ).not.toHaveBeenCalled();
				expect( treeRotateSpy ).not.toHaveBeenCalled();
				
				const oldNode2 = tree.getNodeAt( 2 );
				
				oldNode2.value = { ...oldNode2.value };
				expect( setTimeoutSpy ).not.toHaveBeenCalled();
				expect( treeRotateSpy ).not.toHaveBeenCalled();

				tree.insertNode( oldNode2 );
				expect( setTimeoutSpy ).not.toHaveBeenCalled();
				expect( treeRotateSpy ).not.toHaveBeenCalled();

				oldNode2.value.a = oldNode2.value.a;
				tree.synchronize( oldNode2 );
				expect( setTimeoutSpy ).not.toHaveBeenCalled();
				expect( treeRotateSpy ).not.toHaveBeenCalled();

				treeRotateSpy.mockRestore();
				treeRotateSpy = tree = null;
			} );
			test( 'attempt on an already balanced tree is a no op', () => {
				let tree = new Tree([ -2, 3, 0, 9 ]);
				jest.runOnlyPendingTimers();
				// @ts-ignore
				clearTimeoutSpy.mockClear();
				tree.rotate();
				expect( clearTimeoutSpy ).not.toHaveBeenCalled();
				tree = null;
			} );
			test( 'attempt on an already balanced tree is a no op', () => {
				let tree = new Tree([ -2, 3, 0, 9 ]);
				jest.runOnlyPendingTimers();
				// @ts-ignore
				clearTimeoutSpy.mockClear();
				tree.rotate();
				expect( clearTimeoutSpy ).not.toHaveBeenCalled();
				tree = null;
			} );
		} );
		describe( 'synchronize(...)', () => {
			let testValues : Array<number>;
			beforeAll(() => { testValues = [ 0, 3, 6, 9 ] });
			afterAll(() => { testValues = null });
			describe( '***', () => {
				let returnedSelf, syncOccurred = false;
				beforeAll(() => {
					let tree = new Tree( testValues );
					const node = tree.getNodeAt( 1 ).detach();
					const arraySpliceSpy = jest.spyOn( Array.prototype, 'splice' );
					returnedSelf = tree.synchronize( node ) === tree;
					syncOccurred = arraySpliceSpy.mock.calls.length > 0;
					arraySpliceSpy.mockRestore();
					tree = null;
				});
				afterAll(() => { returnedSelf = syncOccurred = null });
				test( 'returns the tree', () => { expect( returnedSelf ).toBe( true ) });
				test( 'has no effect if no change in value on tree', () => {
					expect( syncOccurred ).toBe( false );
				} );
			} );
			test( 'rebalances tree when value of an undetached node changes', () => {
				let tree = new Tree( testValues );
				const node = tree.getNodeAt( 3 );
				expect( tree.values ).toStrictEqual( testValues );
				const synchronizeSpy = jest.spyOn( tree, 'synchronize' );
				node.value = 4;
				expect( synchronizeSpy ).toHaveBeenCalledTimes( 1 );
				expect( tree.values ).toStrictEqual([ 0, 3, 4, 6 ]);
				synchronizeSpy.mockRestore();
				tree = null;
			} );
			test( 'does not rebalance tree when value change of an undetached node is within index placement range', () => {
				let tree = new Tree( testValues );
				const OLD_INDEX = 2;
				const node = tree.getNodeAt( OLD_INDEX );
				expect( tree.values ).toStrictEqual( testValues );
				let arraySpliceSpy = jest.spyOn( Array.prototype, 'splice' );
				node.value = 4;
				const newTreeValues = tree.values;
				expect( newTreeValues ).toStrictEqual([ 0, 3, 4, 9 ]);
				expect( newTreeValues[ OLD_INDEX ] ).toBe( 4 );
				// the following looks for array splice invocation to return
				// the temporarily withheld current node to its previous spot.
				expect( arraySpliceSpy.mock.calls.some( c => ( 
					c[ 0 ] === OLD_INDEX &&
					c[ 1 ] === 0 &&
					c[ 2 ] === node
				) ) ).toBe( true );
				arraySpliceSpy.mockRestore()
				arraySpliceSpy = null;
				tree = null;
			} );
			test( 'suspends undetached node from tree if its value is changed to a value of another undetached node', () => {
				let tree = new Tree( testValues );
				const node = tree.getNodeAt( 3 );
				expect( tree.values ).toStrictEqual( testValues );
				const synchronizeSpy = jest.spyOn( tree, 'synchronize' );
				node.value = testValues[ 1 ];
				expect( synchronizeSpy ).toHaveBeenCalledTimes( 1 );
				expect( tree.values ).toStrictEqual( testValues.slice( 0, -1 ) );
				synchronizeSpy.mockRestore();
				tree = null;
			} );
			test( 'change in value of a detached node has no effect', () => {
				let tree = new Tree( testValues );
				const detachedNode = tree.getNodeAt( 1 ).detach();
				const _testValues = [ ...testValues ]
				_testValues.splice( 1, 1 );
				expect( tree.values ).toStrictEqual( _testValues );
				const synchronizeSpy = jest.spyOn( tree, 'synchronize' );
				detachedNode.value = testValues[ 1 ];
				expect( synchronizeSpy ).not.toHaveBeenCalled();
				expect( tree.values ).toStrictEqual( _testValues );
				synchronizeSpy.mockRestore();
				tree = null;
			} );
		} );
		describe( 'traverse(...)', () => {
			let testValues = [ 0, 3, 6, 9 ];
			let tree = new Tree( testValues );
			test( 'throws on invalid callback argument', () => {
				expect(() => { tree.traverse( null ) }).toThrow( TypeError );
				expect(() => { tree.traverse( null ) }).toThrow(
					'Invalid `cb` argument supplied to `traverse` method. Void function expected'
				);
			} );
			describe( 'when no valid callback argument supplied',  () => {
				test( 'returns a list of the traversed nodes in left-to-right in-order traversal', () => {
					expect( tree.traverse() ).toHaveLength( testValues.length );
				} );
			} );
			describe( 'when supplied with valid callback argument', () => {
				let mockCb, returnValue;
				beforeAll(() => {
					mockCb = jest.fn();
					returnValue = tree.traverse( mockCb );
				} );
				afterAll(() => { mockCb = returnValue = null } );
				test( 'returns void', () => { expect( returnValue ).toBeUndefined() } );
				test( 'invokes the `cb` argument for all traversed nodes', () => {
					expect( mockCb ).toHaveBeenCalledTimes( testValues.length );
				} );
			} );
			test( 'invokes the traversal generator with options argument', () => {
				const genTraversalSpy = jest.spyOn( tree, 'genTraversal' );
				const options = {};
				tree.traverse( undefined, options );
				expect( genTraversalSpy ).toHaveBeenCalledTimes( 1 );
				expect( genTraversalSpy ).toHaveBeenCalledWith( options )
				genTraversalSpy.mockRestore();
			} );
		} );
	} );
	describe( 'tree node', () => {
		let values : Array<number>;
		let tree : Tree<number>;
		beforeAll(() => {
			values = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ];
			tree = new Tree( values );
		});
		afterAll(() => { values = tree = null });
		describe( 'properties', () => {
			let testValues : Array<number>;
			let node : TreeNode<number>;
			let tree : Tree<number>;
			beforeAll(() => {
				testValues = [ 1, 3, 5, 7, 9 ];
				tree =  new Tree( testValues );
				node = tree.getNodeAt( 3 );
			});
			afterAll(() => { testValues = node = tree = null });
			describe( 'getters', () => {
				let node : TreeNode<number>;
				let tree : Tree<number>;
				beforeAll(() => {
					tree = new Tree( values );
					node = tree.getNodeAt( 1 );
				});
				afterAll(() => { node = tree = null });
				describe( 'children', () => {
					test( 'returns node\'s children information', () => {
						const { children } = node;
						expect( children ).toHaveLength( 2 );
						expect( children[ 0 ].value ).toBe( 1 )
						expect( children[ 1 ].value ).toBe( 3 )
					} );
				} );
				describe( 'index', () => {
					test( 'returns node\'s (l-t-r inorder) index positioning on the tree', () => {
						expect( node.index ).toBe( 1 );
					} );
				} );
				describe( 'isDetached', () => {
					test( 'returns node\'s information on whether it is currently detached from its tree', () => {
						expect( node.isDetached ).toBe( false );
					} );
				} );
				describe( 'transition', () => {
					test( 'returns node\'s information on its current transition mode', () => {
						expect( node.transition ).toBe( 0 );
					} );
				} );
				describe( 'isFree', () => {
					test( 'returns node\'s information on whether it is associated with any tree', () => {
						expect( node.isFree ).toBe( false );
					} );
				} );
				describe( 'left', () => {
					test( 'returns node\'s left child node', () => {
						expect( node.left.value ).toBe( 1 );
					} );
				} );
				describe( 'right', () => {
					test( 'returns node\'s right child node', () => {
						expect( node.right.value ).toBe( 3 );
					} );
				} );
				describe( 'root', () => {
					test( 'returns node\'s root child node', () => {
						expect( node.root.value ).toBe( 4 );
					} );
				} );
				describe( 'tree', () => {
					test( "returns node's associated tree", () => {
						expect( node.tree ).toBe( tree );
					} );
				} );
				describe( 'value', () => {
					test( 'returns node\'s  value', () => {
						expect( node.value ).toBe( 2 );
					} );
				} );
			} );
			describe( 'setters', () => {
				describe( 'tree', () => {
					describe( 'assignment process', () => {
						let treeReassignmentCompleted = false;
						beforeAll(() => {
							let _values = [ 60 ];
							let origTree = new Tree( _values );
							let altTree = new Tree<number>();
							let origTreeValues = [ ...origTree.values ];
							let node = origTree.getNodeAt( 0 );
							if(
								node.tree !== origTree ||
								[ ...altTree.values ].length !== 0 ||
								origTreeValues.length !== _values.length ||
								origTreeValues.some(( v, i ) => v !== _values[ i ])
							){ return } 
							node.tree = altTree;
							let altTreeValues = [ ...altTree.values ];
							treeReassignmentCompleted = (
								node.tree === altTree &&
								[ ...origTree.values ].length === 0 &&
								altTreeValues.length === 1 &&
								altTreeValues[ 0 ] === _values[ 0 ] &&
								altTree.getNodeAt( 0 ) === node
							);
						});
						test( 're-assigns node to a new tree', () => {
							expect( treeReassignmentCompleted ).toBe( true );
						} );
						test( 're-assigned node is culled from its former tree', () => {
							expect( treeReassignmentCompleted ).toBe( true );
						} );
						test( 'old tree culls re-assiged node from its internal state', () => {
							expect( treeReassignmentCompleted ).toBe( true );
						} );
						test( 'new tree joins the incoming node to its internal state', () => {
							expect( treeReassignmentCompleted ).toBe( true );
						} );
					} );
					test( "attempt to set node tree to its current tree property is a no op", () => {
						let nodeJoinSpy = jest.spyOn( node, 'join' )
						node.tree = tree;
						expect( nodeJoinSpy ).not.toHaveBeenCalled();
						nodeJoinSpy.mockRestore();
						nodeJoinSpy = null;
					} );
					test( 'throws on invalid tree argument', () => {
						const invalidTree = new Object();
						// @ts-ignore
						expect(() => { node.tree = invalidTree }).toThrow( TypeError );
						// @ts-ignore
						expect(() => { node.tree = invalidTree }).toThrow(
							'Cannot attach a node to an invalid tree.'
						);
					} );
					test( 'throws on attempt to set the tree property to null or undefined', () => {
						expect(() => { node.tree = null }).toThrow( TypeError );
						expect(() => { node.tree = null }).toThrow(
							'Cannot direclty unset a node\'s tree property. Please use the `node.free()` method to properly disassociate it from its tree.'
						);
						expect(() => { node.tree = undefined }).toThrow( TypeError );
						expect(() => { node.tree = undefined }).toThrow(
							'Cannot direclty unset a node\'s tree property. Please use the `node.free()` method to properly disassociate it from its tree.'
						);
					} );
				} );
				describe( 'value', () => {
					describe( 'update behavior', () => {
						let updateComplete = false;
						beforeAll(() => {
							const tree = new Tree([ 54, 76 ]);
							const node0 = tree.getNodeAt( 0 );
							const node1 = tree.getNodeAt( 1 );
							if(
								!( node0.index === 0 && node0.value === 54 ) ||
								!( node1.index === 1 && node1.value === 76 )
							) {  return }
							node0.value = 90;
							updateComplete = (
								// @ts-ignore					
								( node1.index === 0 && node1.value === 76 ) &&
								// @ts-ignore			
								( node0.index === 1 && node0.value === 90 )
							);
						});
						test( 'sets node values', () => {
							expect( updateComplete ).toBe( true );	
						} );
						test( 'prompts tree synchronization', () => {
							expect( updateComplete ).toBe( true );
						} );
					} );
					test( 'attempt to set node to its current value is a no op', () => {
						const tree = new Tree([ 23 ]);
						const node = tree.getNodeAt( 0 );
						expect( node.value ).toBe( 23 );
						const treeSynchronizeSpy = jest
							.spyOn( tree, 'synchronize' )
							.mockImplementation( () => tree );
						node.value = 23;
						expect( treeSynchronizeSpy ).not.toHaveBeenCalled();
						treeSynchronizeSpy.mockRestore();
					} );
				} );
			} );
		} );
		describe( 'instance methods', () => {
			describe( 'detach(...)', () => {
				let preExitState = {} as State<number>; 
				let postExitState = {} as State<number>;
				let node : TreeNode<number>;
				let returnVal : TreeNode<number>;
				let tree : Tree<number>;
				beforeAll(() => {
					const TEST_INDEX = 2;
					tree = new Tree( values );
					node = tree.getNodeAt( TEST_INDEX );
					preExitState = {
						detached: node.isDetached,
						isInTree: [ ...tree.values ].includes( values[ TEST_INDEX ] ),
						tree: node.tree
					};
					returnVal = node.detach();
					postExitState = {
						detached: node.isDetached,
						isInTree: [ ...tree.values ].includes( values[ TEST_INDEX ] ),
						tree: node.tree
					};
				});
				afterAll(() => { preExitState = postExitState = node = tree = null });
				test( 'returns self', () => { expect( returnVal ).toBe( node ) })
				test( 'raises detached flag', () => {
					expect( preExitState.detached ).toBe( false );
					expect( postExitState.detached ).toBe( true );
				} );
				test( 'removes self from the tree', () => {
					expect( preExitState.isInTree ).toBe( true );
					expect( postExitState.isInTree ).toBe( false );
				} );
				test( 'retains association to the tree', () => {
					expect( preExitState.tree ).toBe( tree );
					expect( postExitState.tree ).toBe( tree );
				} );
				test( 'attempt to detach if already detached is a no op', () => {
					const tree = new Tree([ 33 ]);
					const detachedNode = tree.getNodeAt( 0 );
					expect( detachedNode.isDetached ).toBe( false );
					const treeRemoveNodeSpy = jest.spyOn( tree, 'removeNode' );
					detachedNode.detach();
					expect( detachedNode.isDetached ).toBe( true );
					expect( treeRemoveNodeSpy ).toHaveBeenCalledTimes( 1 );
					treeRemoveNodeSpy.mockClear();
					detachedNode.detach();
					expect( detachedNode.isDetached ).toBe( true );
					expect( treeRemoveNodeSpy ).not.toHaveBeenCalled();
					treeRemoveNodeSpy.mockRestore();
				} );
			} );
			describe( 'free(...)', () => {
				let preFreeState = {} as State<number>;
				let postFreeState = {} as State<number>;
				let node : TreeNode<number>;
				let returnVal : TreeNode<number>;
				let tree : Tree<number>;
				beforeAll(() => {
					const TEST_INDEX = 3;
					tree = new Tree( values );
					node = tree.getNodeAt( TEST_INDEX );
					preFreeState = {
						detached: node.isDetached,
						isInTree: [ ...tree.values ].includes( values[ TEST_INDEX ]),
						tree: node.tree
					};
					returnVal = node.free();
					postFreeState = {
						detached: node.isDetached,
						isInTree: [ ...tree.values ].includes( values[ TEST_INDEX ]),
						tree: node.tree
					};
				});
				afterAll(() => { preFreeState = postFreeState = node = tree = null });
				test( 'returns self', () => { expect( returnVal ).toBe( node ) })
				test( 'raises detached flag', () => {
					expect( preFreeState.detached ).toBe( false );
					expect( postFreeState.detached ).toBe( true );
				} );
				test( 'removes self from the tree', () => {
					expect( preFreeState.isInTree ).toBe( true );
					expect( postFreeState.isInTree ).toBe( false );
				} );
				test( 'discsard association to the tree', () => {
					expect( preFreeState.tree ).toBe( tree );
					expect( postFreeState.tree ).toBeUndefined();
				} );
				test( 'attempt to free an already freed node is a no op', () => {
					const tree = new Tree([ 1 ]);
					const node = tree.getNodeAt( 0 );
					expect( node.isFree ).toBe( false );
					const treeRemoveNodeSpy = jest.spyOn( tree, 'removeNode' );
					node.free();
					expect( node.isFree ).toBe( true );
					expect( treeRemoveNodeSpy ).toHaveBeenCalledTimes( 1 );
					expect( treeRemoveNodeSpy ).toHaveBeenCalledWith( node );
					treeRemoveNodeSpy.mockClear();
					node.free();
					expect( treeRemoveNodeSpy ).not.toHaveBeenCalled();
					treeRemoveNodeSpy.mockRestore();
				} );
			} );
			describe( '*genAncestors(...)', () => {
				let node : TreeNode<number>;
				beforeAll(() => { node = tree.getNodeAt( 0 ) });
				afterAll(() => { node = null });
				test( 'returns a generator', () => {
					expect( node.genAncestors().next() ).toStrictEqual(
						expect.objectContaining({
							done: expect.any( Boolean ),
							value: expect.anything()
						})
					);
				} );
				test( 'generates ancestors up to the tree root by default', () => {
					const res = [];
					for( const r of node.genAncestors() ) { res.push( r.value ) }
					expect( res ).toStrictEqual([ 2, 4, 8 ]);
				} );
				test( 'generates ancestors only 2 generaion up', () => {
					const res = [];
					for( const r of node.genAncestors( 2 ) ) { res.push( r.value ) }
					expect( res ).toStrictEqual([ 2, 4 ]);
				} );
			} );
			describe( '*genDescendants(...)', () => {
				let node : TreeNode<number>;
				beforeAll(() => { node = tree.getNodeAt( 11 ) });
				afterAll(() => { node = null });
				test( 'returns a generator', () => {
					expect( node.genDescendants().next() ).toStrictEqual(
						expect.objectContaining({
							done: expect.any( Boolean ),
							value: expect.anything()
						})
					);
				} );
				test( 'generates descendants down to the leaves by default', () => {
					const res = [];
					for( const r of node.genDescendants() ) { res.push( r.value ) }
					expect( res ).toStrictEqual([ 9, 10, 11, 13, 14, 15 ]);
				} );
				test( 'generates descendants only 2 generaion down', () => {
					const res = [];
					for( const r of node.genDescendants( 2 ) ) { res.push( r.value ) }
					expect( res ).toStrictEqual([ 10, 14 ]);
				} );
			} );
			describe( '*genParentsUntil(...)', () => {
				let node : TreeNode<number>;
				beforeAll(() => { node = tree.getNodeAt( 0 ) });
				afterAll(() => { node = null });
				test( 'returns a generator', () => {
					expect( node.genAncestors().next() ).toStrictEqual(
						expect.objectContaining({
							done: expect.any( Boolean ),
							value: expect.anything()
						})
					);
				} );
				test( 'generates parents up to the tree root by default', () => {
					const res = [];
					for( const r of node.genParentsUntil() ) { res.push( r.value ) }
					expect( res ).toStrictEqual([ 2, 4, 8 ]);
				} );
				test( 'generates parents until last ancestor found in the ancestral path', () => {
					const res = [];
					for( const r of tree.getNodeAt( -1 ).genParentsUntil(
						tree.getNodeAt( 11 )
					) ) { res.push( r.value ) }
					expect( res ).toStrictEqual([ 14, 12 ]);
				} );
			} );
			describe( 'getAncestors(...)', () => {
				let node : TreeNode<number>;
				beforeAll(() => { node = tree.getNodeAt( 0 ) });
				afterAll(() => { node = null });
				test( 'returns ancestors up to the tree root by default', () => {
					expect( node.getAncestors().map( r => r.value ) ).toStrictEqual([ 2, 4, 8 ]);
				} );
				test( 'returns ancestors only 2 generaion up', () => {
					expect( node.getAncestors( 2 ).map( r => r.value ) ).toStrictEqual([ 2, 4 ]);
				} );
			} );
			describe( 'getDescendants(...)', () => {
				let node : TreeNode<number>;
				beforeAll(() => { node = tree.getNodeAt( 11 ) });
				afterAll(() => { node = null });
				test( 'returns descendants down to the leaves by default', () => {
					expect( node.getDescendants().map( r => r.value ) ).toStrictEqual([ 9, 10, 11, 13, 14, 15 ]);
				} );
				test( 'returns descendants only 2 generaion down', () => {
					expect( node.getDescendants( 2 ).map( r => r.value ) ).toStrictEqual([ 10, 14 ]);
				} );
			} );
			describe( 'getParentsUntil(...)', () => {
				let node : TreeNode<number>;
				beforeAll(() => { node = tree.getNodeAt( 0 ) });
				afterAll(() => { node = null });
				test( 'returns parents up to the tree root by default', () => {
					expect( node.getParentsUntil().map( r => r.value ) ).toStrictEqual([ 2, 4, 8 ]);
				} );
				test( 'returns parents until last ancestor found in the ancestral path', () => {
					expect(
						tree.getNodeAt( -1 ).getParentsUntil(
							tree.getNodeAt( 11 )
						).map( r => r.value )
					).toStrictEqual([ 14, 12 ]);
				} );
			} );
			describe( 'join(...)', () => {
				describe( '***', () => {
					test( 'returns self', () => {
						let tree = new Tree([ 2, 4 ]);
						const detachedNode = tree.getNodeAt( 1 ).detach();
						let treeInsertNodeSpy = jest
							.spyOn( tree, 'insertNode' )
							.mockReturnValue( tree );
						expect( detachedNode.join() ).toBe( detachedNode );
						treeInsertNodeSpy.mockRestore();
						treeInsertNodeSpy = null;
					})
					test( 'rejoins detached node back onto the tree', () => {
						let tree = new Tree([ 3, 6, 9, 17 ]);
						const detachedNode = tree.getNodeAt( 2 );
						expect( detachedNode.isDetached ).toBe( false );
						expect([ ...tree.values ].includes( detachedNode.value) ).toBe( true );
						detachedNode.detach();
						expect( detachedNode.isDetached ).toBe( true );
						expect([ ...tree.values ].includes( detachedNode.value) ).toBe( false );
						detachedNode.join();
						expect( detachedNode.isDetached ).toBe( false );
						expect([ ...tree.values ].includes( detachedNode.value) ).toBe( true );
						tree = null;
					} );
				} );
				test( 'attempt to join undetached node to the tree is a noop', () => {
					let tree = new Tree([ 1, 2 ]);
					const node = tree.getNodeAt( 0 );
					expect( node.isDetached ).toBe( false );
					expect([ ...tree.values ].includes( node.value ) ).toBe( true );
					let treeInsertNodeSpy = jest.spyOn( tree, 'insertNode' );
					node.join();
					expect( node.isDetached ).toBe( false );
					expect( treeInsertNodeSpy ).not.toHaveBeenCalled();
					treeInsertNodeSpy.mockRestore();
					treeInsertNodeSpy = tree = null;
				} );
				test( 'throws on attempt to join a free node to the tree', () => {
					let tree = new Tree([ 1, 3, 7 ]);
					const detachedNode = tree.getNodeAt( 2 );
					expect( detachedNode.isFree ).toBe( false );
					expect([ ...tree.values ].includes( detachedNode.value )).toBe( true );
					detachedNode.free();
					expect( detachedNode.isFree ).toBe( true );
					expect([ ...tree.values ].includes( detachedNode.value )).toBe( false );
					expect(() => { detachedNode.join() }).toThrow( ReferenceError );
					expect(() => { detachedNode.join() }).toThrow(
						'Cannot join node. Referenced tree does not exist.'
					);
					tree = null;
				} );
			} );
		} );
	} );
} );
