import { SimpleType as SimpleType_ } from "./simple-type";
import { simpleTypeToStringWithCache, simpleTypeToString } from "./simple-type-to-string";
import { isAssignableToSimpleTypeWithCache } from "./is-assignable-to-simple-type";
import { SimpleTypeComparisonOptions } from "./simple-type-comparison-options";

export interface FlattedSimpleType<TSimpleType extends SimpleType_ = SimpleType_> {
	readonly type: TSimpleType;
	readonly cache: SimpleType_[];
}

export type MasterType<T extends SimpleType_ = SimpleType_> = T | FlattedSimpleType<T>;

export const MasterType = {
	getChild: <TParent extends SimpleType_, TResult extends SimpleType_>(self: MasterType<TParent>, childGetter: (self: TParent) => TResult): MasterType<TResult> =>
		"cache" in self
			? {
					type: childGetter(self.type),
					cache: self.cache
			  }
			: childGetter(self),

	getChildren: <TParent extends SimpleType_, TResult extends SimpleType_>(self: MasterType<TParent>, childrenGetter: (self: TParent) => TResult[]): MasterType<TResult>[] =>
		"cache" in self ? childrenGetter(self.type).map(i => ({ type: i, cache: self.cache })) : childrenGetter(self),

	tryGetChild: <TParent extends SimpleType_, TResult extends SimpleType_>(self: MasterType<TParent>, childTryGetter: (self: TParent) => TResult | undefined): MasterType<TResult> | undefined => {
		const result = "cache" in self ? { type: childTryGetter(self.type), cache: self.cache } : { type: childTryGetter(self) };
		if (result.cache === undefined) {
			return result.type;
		}

		if (result.type === undefined) {
			return undefined;
		}

		return result as MasterType<TResult>;
	},

	tryGetChildren: <TParent extends SimpleType_, TResult extends SimpleType_>(
		self: MasterType<TParent>,
		childrenTryGetter: (self: TParent) => TResult[] | undefined
	): MasterType<TResult>[] | undefined => {
		const result = "cache" in self ? { children: childrenTryGetter(self.type), cache: self.cache } : { children: childrenTryGetter(self) };
		if (result.cache === undefined) {
			return result.children;
		}

		if (result.children === undefined) {
			return undefined;
		}

		return result.children.map(i => ({ type: i, cache: result.cache }));
	},

	addCache: <TParent extends SimpleType_, TSimpleType extends SimpleType_>(self: MasterType<TParent>, simpleType: TSimpleType): MasterType<TSimpleType> =>
		"cache" in self
			? {
					cache: self.cache,
					type: simpleType
			  }
			: simpleType,

	mapType: <TParent extends SimpleType_, TResult>(self: MasterType<TParent>, mapOp: (self: TParent) => TResult): TResult => ("cache" in self ? mapOp(self.type) : mapOp(self)),

	toString: <TParent extends SimpleType_>(self: MasterType<TParent>) => ("cache" in self ? simpleTypeToStringWithCache(self.type, self.cache) : simpleTypeToString(self)),

	isAssignableTo: (from: MasterType, to: MasterType, config?: SimpleTypeComparisonOptions) =>
		"cache" in from
			? "cache" in to
				? isAssignableToSimpleTypeWithCache(from.type, from.cache, to.type, to.cache, config)
				: isAssignableToSimpleTypeWithCache(from.type, from.cache, to, [], config)
			: "cache" in to
			? isAssignableToSimpleTypeWithCache(from, [], to.type, to.cache, config)
			: isAssignableToSimpleTypeWithCache(from, [], to, [], config)
} as const;
