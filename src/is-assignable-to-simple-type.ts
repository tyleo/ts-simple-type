import { combineIntersectingSimpleTypes } from "./combine-intersecting-simple-types";
import { isSimpleTypeLiteral, PRIMITIVE_TYPE_TO_LITERAL_MAP, SimpleType, SimpleTypeGenericArguments, SimpleTypeKind } from "./simple-type";
import { SimpleTypeComparisonOptions } from "./simple-type-comparison-options";
import { and, or } from "./util";

/**
 * TODO: Remove strict default in a major version change to align with Typescript.
 */
const DEFAULT_CONFIG: SimpleTypeComparisonOptions = {
	strict: true
};

/**
 * Returns if typeB is assignable to typeA.
 * @param typeA Type A
 * @param typeB Type B
 * @param config
 */
export function isAssignableToSimpleType(typeA: SimpleType, typeB: SimpleType, config: SimpleTypeComparisonOptions = DEFAULT_CONFIG): boolean {
	return isAssignableToSimpleTypeWithCache(typeA, [], typeB, [], config);
}

export function isAssignableToSimpleTypeWithCache(
	typeA: SimpleType,
	typeACache: SimpleType[],
	typeB: SimpleType,
	typeBCache: SimpleType[],
	config: SimpleTypeComparisonOptions = DEFAULT_CONFIG
): boolean {
	return isAssignableToSimpleTypeInternal(typeA, typeACache, typeB, typeBCache, {
		config,
		inCircularA: false,
		inCircularB: false,
		insideType: new Set(),
		genericParameterMapA: new Map(),
		genericParameterMapB: new Map()
	});
}

interface IsAssignableToSimpleTypeOptions {
	config: SimpleTypeComparisonOptions;
	inCircularA: boolean;
	inCircularB: boolean;
	insideType: Set<SimpleType>;
	genericParameterMapA: Map<string, SimpleType>;
	genericParameterMapB: Map<string, SimpleType>;
}

function isAssignableToSimpleTypeInternal(typeA: SimpleType, typeACache: SimpleType[], typeB: SimpleType, typeBCache: SimpleType[], options: IsAssignableToSimpleTypeOptions): boolean {
	/**
	 options = { ...options };
	 (options as any).depth = ((options as any).depth || 0) + 1;
	 //console.log("###", "\t".repeat((options as any).depth), simpleTypeToString(typeA), "===", simpleTypeToString(typeB), "(", typeA.kind, "===", typeB.kind, ")", (options as any).depth, "###");
	 //if ((options as any).depth > 10) return false;
	 console.log("###", "\t".repeat((options as any).depth), require("./simple-type-to-string").simpleTypeToString(typeA), "===", require("./simple-type-to-string").simpleTypeToString(typeB), "(", typeA.kind, "===", typeB.kind, ")", (options as any).depth, "###");
	 /**/

	if (typeA === typeB) {
		return true;
	}

	// We might need a better way of handling refs, but these check are good for now
	if (options.insideType.has(typeA) || options.insideType.has(typeB)) {
		return true;
	}

	// Circular types
	if (options.inCircularA || options.inCircularB) {
		return true;
	}

	// Any and unknown
	if (typeA.kind === SimpleTypeKind.UNKNOWN || typeA.kind === SimpleTypeKind.ANY || typeB.kind === SimpleTypeKind.ANY) {
		return true;
	}

	// This check has been added to optimize complex types.
	// It's only run on named non-generic interface, object, alias and class types
	// Here we compare their names to see if they are equal. For example comparing "HTMLElement === HTMLElement" don't need to traverse both structures.
	// I will remove this check after I add optimization and caching of comparison results (especially for built in types)
	// The basic challenge is that types that I compare do not necessarily share references, so a reference check isn't enough
	if (
		typeA.kind === typeB.kind &&
		[SimpleTypeKind.INTERFACE, SimpleTypeKind.OBJECT, SimpleTypeKind.ALIAS, SimpleTypeKind.CLASS].includes(typeA.kind) &&
		!("typeParameters" in typeA) &&
		!("typeParameters" in typeB) &&
		(typeA.name && typeB.name && typeA.name === typeB.name)
	) {
		return true;
	}

	switch (typeB.kind) {
		case SimpleTypeKind.NEVER:
			return true;

		case SimpleTypeKind.FLAT_TYPE_REF:
			return isAssignableToSimpleTypeInternal(typeA, typeACache, typeBCache[typeB.ref], typeBCache, {
				...options,
				inCircularB: true,
				insideType: new Set([...options.insideType, typeB])
			});
		case SimpleTypeKind.ENUM_MEMBER:
			return isAssignableToSimpleTypeInternal(typeA, typeACache, typeB.type, typeBCache, options);
		case SimpleTypeKind.ENUM:
			return and(typeB.types, childTypeB => isAssignableToSimpleTypeInternal(typeA, typeACache, childTypeB, typeBCache, options));
		case SimpleTypeKind.UNION:
			return and(typeB.types, childTypeB => isAssignableToSimpleTypeInternal(typeA, typeACache, childTypeB, typeBCache, options));
		case SimpleTypeKind.INTERSECTION: {
			const combinedIntersectionType = combineIntersectingSimpleTypes(typeB.types);
			if (combinedIntersectionType.kind === SimpleTypeKind.INTERSECTION) {
				return false;
			}
			return isAssignableToSimpleTypeInternal(typeA, typeACache, combinedIntersectionType, typeBCache, options);
		}

		case SimpleTypeKind.ALIAS:
			return isAssignableToSimpleTypeInternal(typeA, typeACache, typeB.target, typeBCache, options);
		case SimpleTypeKind.GENERIC_ARGUMENTS: {
			return isAssignableToSimpleTypeInternal(typeA, typeACache, typeB.target, typeBCache, {
				...options,
				genericParameterMapB: extendTypeParameterMap(typeB, options.genericParameterMapB)
			});
		}
		case SimpleTypeKind.GENERIC_PARAMETER: {
			const newOptions = {
				...options,
				insideType: new Set([...options.insideType, typeB])
			};

			const realType = options.genericParameterMapB.get(typeB.name);
			return isAssignableToSimpleTypeInternal(typeA, typeACache, realType || typeB.default || { kind: SimpleTypeKind.ANY }, typeBCache, newOptions);
		}

		case SimpleTypeKind.UNDEFINED:
		case SimpleTypeKind.NULL: {
			// When strict null checks are turned off, "undefined" and "null" are in the domain of every type
			const strictNullChecks = options.config.strictNullChecks === true || (options.config.strictNullChecks == null && options.config.strict);
			if (!strictNullChecks) {
				return true;
			}
		}
	}

	switch (typeA.kind) {
		// Circular references
		case SimpleTypeKind.FLAT_TYPE_REF:
			return isAssignableToSimpleTypeInternal(typeACache[typeA.ref], typeACache, typeB, typeBCache, {
				...options,
				inCircularA: true,
				insideType: new Set([...options.insideType, typeA])
			});

		// Literals and enum members
		case SimpleTypeKind.NUMBER_LITERAL:
		case SimpleTypeKind.STRING_LITERAL:
		case SimpleTypeKind.BIG_INT_LITERAL:
		case SimpleTypeKind.BOOLEAN_LITERAL:
			return isSimpleTypeLiteral(typeB) ? typeA.value === typeB.value : false;

		case SimpleTypeKind.ENUM_MEMBER:
			return isAssignableToSimpleTypeInternal(typeA.type, typeACache, typeB, typeBCache, options);

		// Primitive types
		case SimpleTypeKind.STRING:
		case SimpleTypeKind.BOOLEAN:
		case SimpleTypeKind.NUMBER:
		case SimpleTypeKind.BIG_INT: {
			if (isSimpleTypeLiteral(typeB)) {
				return PRIMITIVE_TYPE_TO_LITERAL_MAP[typeA.kind] === typeB.kind;
			}

			return typeA.kind === typeB.kind;
		}

		case SimpleTypeKind.UNDEFINED:
		case SimpleTypeKind.NULL:
			return typeA.kind === typeB.kind;

		// Void
		case SimpleTypeKind.VOID:
			return typeB.kind === SimpleTypeKind.VOID || typeB.kind === SimpleTypeKind.UNDEFINED;

		// Never
		case SimpleTypeKind.NEVER:
			return false;

		// Alias
		case SimpleTypeKind.ALIAS:
			return isAssignableToSimpleTypeInternal(typeA.target, typeACache, typeB, typeBCache, options);

		// Generic types
		case SimpleTypeKind.GENERIC_PARAMETER: {
			const newOptions = {
				...options,
				insideType: new Set([...options.insideType, typeA])
			};

			const realType = options.genericParameterMapA.get(typeA.name);
			return isAssignableToSimpleTypeInternal(realType || typeA.default || { kind: SimpleTypeKind.ANY }, typeACache, typeB, typeBCache, newOptions);
		}

		case SimpleTypeKind.GENERIC_ARGUMENTS:
			return isAssignableToSimpleTypeInternal(typeA.target, typeACache, typeB, typeBCache, {
				...options,
				genericParameterMapA: extendTypeParameterMap(typeA, options.genericParameterMapA)
			});

		// Arrays
		case SimpleTypeKind.ARRAY: {
			if (typeB.kind === SimpleTypeKind.ARRAY) {
				return isAssignableToSimpleTypeInternal(typeA.type, typeACache, typeB.type, typeBCache, options);
			} else if (typeB.kind === SimpleTypeKind.TUPLE) {
				return and(typeB.members, memberB => isAssignableToSimpleTypeInternal(typeA.type, typeACache, memberB.type, typeBCache, options));
			}

			return false;
		}

		// Functions
		case SimpleTypeKind.FUNCTION:
		case SimpleTypeKind.METHOD: {
			if (typeB.kind !== SimpleTypeKind.FUNCTION && typeB.kind !== SimpleTypeKind.METHOD) return false;

			if (typeB.argTypes == null || typeB.returnType == null) return typeA.argTypes == null || typeA.returnType == null;
			if (typeA.argTypes == null || typeA.returnType == null) return true;

			// Any returntype is assignable to void
			if (typeA.returnType.kind !== SimpleTypeKind.VOID && !isAssignableToSimpleTypeInternal(typeA.returnType, typeACache, typeB.returnType, typeBCache, options)) return false;

			// Test "this" types
			const typeAThisArg = typeA.argTypes.find(arg => arg.name === "this");
			const typeBThisArg = typeB.argTypes.find(arg => arg.name === "this");

			if (typeAThisArg != null && typeBThisArg != null) {
				if (!isAssignableToSimpleTypeInternal(typeAThisArg.type, typeACache, typeBThisArg.type, typeBCache, options)) {
					return false;
				}
			}

			const argTypesA = typeAThisArg == null ? typeA.argTypes : typeA.argTypes.filter(arg => arg !== typeAThisArg);
			const argTypesB = typeBThisArg == null ? typeB.argTypes : typeB.argTypes.filter(arg => arg !== typeBThisArg);

			// A function with 0 args can be assigned to any other function
			if (argTypesB.length === 0) {
				return true;
			}

			// Compare the types of each arg
			for (let i = 0; i < Math.max(argTypesA.length, argTypesB.length); i++) {
				const argA = argTypesA[i];
				const argB = argTypesB[i];

				// If argA is not present, check if argB is optional or not present as well
				if (argA == null) {
					return argB == null || argB.optional;
				}

				// If argB is not present, check if argA is optional
				if (argB == null) {
					return argA.optional;
				}

				// Check if we are comparing a spread against a non-spread
				if (argA.spread && argA.type.kind === SimpleTypeKind.ARRAY && (!argB.spread && argB.type.kind !== SimpleTypeKind.ARRAY)) {
					if (!isAssignableToSimpleTypeInternal(argA.type.type, typeACache, argB.type, typeBCache, options)) {
						return false;
					}

					continue;
				}

				// If the types are not assignable return false right away
				if (!isAssignableToSimpleTypeInternal(argB.type, typeBCache, argA.type, typeACache, options)) {
					return false;
				}
			}

			return true;
		}

		// Unions and enum members
		case SimpleTypeKind.ENUM:
		case SimpleTypeKind.UNION:
			return or(typeA.types, childTypeA => isAssignableToSimpleTypeInternal(childTypeA, typeACache, typeB, typeBCache, options));

		// Intersections
		case SimpleTypeKind.INTERSECTION: {
			const combinedIntersectionType = combineIntersectingSimpleTypes(typeA.types);

			if (combinedIntersectionType.kind === SimpleTypeKind.INTERSECTION) {
				return false;
			}

			return isAssignableToSimpleTypeInternal(combinedIntersectionType, typeACache, typeB, typeBCache, options);
		}

		// Interfaces
		case SimpleTypeKind.INTERFACE:
		case SimpleTypeKind.OBJECT:
		case SimpleTypeKind.CLASS: {
			// If there are no members check that "typeB" is not assignable to 'null' and 'undefined'.
			// Here we allow assigning anything but 'null' and 'undefined' to the type '{}'
			if ("members" in typeA && (typeA.members == null || typeA.members.length === 0)) {
				return !isAssignableToSimpleTypeInternal(
					{
						kind: SimpleTypeKind.UNION,
						types: [{ kind: SimpleTypeKind.NULL }, { kind: SimpleTypeKind.UNDEFINED }]
					},
					typeACache,
					typeB,
					typeBCache,
					options
				);
			}

			switch (typeB.kind) {
				case SimpleTypeKind.INTERFACE:
				case SimpleTypeKind.OBJECT:
				case SimpleTypeKind.CLASS: {
					const membersA = typeA.kind === SimpleTypeKind.CLASS ? [...typeA.methods, ...typeA.properties] : typeA.members || [];
					const membersB = typeB.kind === SimpleTypeKind.CLASS ? [...typeB.methods, ...typeB.properties] : typeB.members || [];

					const newOptions = {
						...options,
						insideType: new Set([...options.insideType, typeA, typeB])
					};

					return (
						and(membersA, memberA => {
							// Make sure that every required prop in typeA is present
							const memberB = membersB.find(memberB => memberA.name === memberB.name);
							return memberB == null ? memberA.optional : true;
						}) &&
						and(membersB, memberB => {
							// Do not allow new props in subtype: contravariance
							const memberA = membersA.find(memberA => memberA.name === memberB.name);
							if (memberA == null) {
								// If we find a member in typeB which isn't in typeA, allow it if both typeA and typeB are object
								//return typeA.kind === SimpleTypeKind.OBJECT && typeB.kind === SimpleTypeKind.OBJECT;
								return typeA.kind === typeB.kind;
							}
							return isAssignableToSimpleTypeInternal(memberA.type, typeACache, memberB.type, typeBCache, newOptions);
						})
					);
				}
				default:
					return false;
			}
		}

		case SimpleTypeKind.TUPLE: {
			if (typeB.kind !== SimpleTypeKind.TUPLE) return false;
			return and(typeA.members, (memberA, i) => {
				const memberB = typeB.members[i];
				if (memberB == null) return memberA.optional;
				return isAssignableToSimpleTypeInternal(memberA.type, typeACache, memberB.type, typeBCache, options);
			});
		}

		case SimpleTypeKind.PROMISE:
			return typeB.kind === SimpleTypeKind.PROMISE && isAssignableToSimpleTypeInternal(typeA.type, typeACache, typeB.type, typeBCache, options);

		case SimpleTypeKind.DATE:
			return typeB.kind === SimpleTypeKind.DATE;

		//default:
		//throw new Error(`Unsupported comparison: ${typeA.kind}`);
	}
}

function extendTypeParameterMap(genericType: SimpleTypeGenericArguments, existingMap: Map<string, SimpleType>) {
	if ("typeParameters" in genericType.target) {
		const parameterEntries = (genericType.target.typeParameters || []).map(
			(parameter, i) => [parameter.name, genericType.typeArguments[i] || parameter.default || { kind: SimpleTypeKind.ANY }] as [string, SimpleType]
		);
		const allParameterEntries = [...existingMap.entries(), ...parameterEntries];
		return new Map(allParameterEntries);
	}

	throw new Error(`Couldn't find 'typeParameter' for type '${genericType.target.kind}'`);
	//return existingMap;
}
