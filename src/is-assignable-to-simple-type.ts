import { isSimpleTypeLiteral, PRIMITIVE_TYPE_TO_LITERAL_MAP, SimpleType, SimpleTypeGenericArguments, SimpleTypeKind } from "./simple-type";
import { and, or } from "./util";

/**
 * Returns if typeB is assignable to typeA.
 * @param typeA Type A
 * @param typeB Type B
 */
export function isAssignableToSimpleType (typeA: SimpleType, typeB: SimpleType): boolean {
	return isAssignabletoSimpleTypeInternal(typeA, typeB, {
		inARef: false,
		inBRef: false,
		genericParameterMapA: new Map(),
		genericParameterMapB: new Map()
	});
}

interface IsAssignableToSimpleTypeOptions {
	inARef: boolean;
	inBRef: boolean;
	genericParameterMapA: Map<string, SimpleType>;
	genericParameterMapB: Map<string, SimpleType>;
}

function isAssignabletoSimpleTypeInternal (typeA: SimpleType, typeB: SimpleType, options: IsAssignableToSimpleTypeOptions): boolean {
	//console.log("###", require("./simple-type-to-string").simpleTypeToString(typeA), "===", require("./simple-type-to-string").simpleTypeToString(typeB), "(", typeA.kind, "===", typeB.kind, ")", "###");

	if (typeA === typeB && !("typeParameters" in typeA)) {
		return true;
	}

	if (typeA === typeB) return true;

	// Handle circular refs
	if (options.inARef && options.inBRef) {
		// We might need a better way of handling refs, but this check is good for now
		return typeA.name === typeB.name;
	}

	if (typeA.kind === SimpleTypeKind.UNKNOWN || typeA.kind === SimpleTypeKind.ANY || typeB.kind === SimpleTypeKind.ANY) {
		return true;
	}

	switch (typeB.kind) {
		case SimpleTypeKind.CIRCULAR_TYPE_REF:
			return isAssignabletoSimpleTypeInternal(typeA, typeB.ref, { ...options, inBRef: true });
		case SimpleTypeKind.ENUM_MEMBER:
			return isAssignabletoSimpleTypeInternal(typeA, typeB.type, options);
		case SimpleTypeKind.ENUM:
			return and(typeB.types, childTypeB => isAssignabletoSimpleTypeInternal(typeA, childTypeB, options));
		case SimpleTypeKind.UNION:
			return and(typeB.types, childTypeB => isAssignabletoSimpleTypeInternal(typeA, childTypeB, options));
		case SimpleTypeKind.INTERSECTION:
			return and(typeB.types, childTypeB => isAssignabletoSimpleTypeInternal(typeA, childTypeB, options));
		case SimpleTypeKind.ALIAS:
			return isAssignabletoSimpleTypeInternal(typeA, typeB.target, options);
		case SimpleTypeKind.GENERIC_ARGUMENTS:
			return isAssignabletoSimpleTypeInternal(typeA, typeB.target, {
				...options,
				genericParameterMapB: extendTypeParameterMap(typeB, options.genericParameterMapB)
			});
		case SimpleTypeKind.GENERIC_PARAMETER:
			const realType = options.genericParameterMapB.get(typeB.name);
			return isAssignabletoSimpleTypeInternal(typeA, realType || typeB.default || { kind: SimpleTypeKind.ANY }, options);
	}

	switch (typeA.kind) {
		// Circular references
		case SimpleTypeKind.CIRCULAR_TYPE_REF:
			return isAssignabletoSimpleTypeInternal(typeA.ref, typeB, { ...options, inARef: true });

		// Literals and enum members
		case SimpleTypeKind.NUMBER_LITERAL:
		case SimpleTypeKind.STRING_LITERAL:
		case SimpleTypeKind.BIG_INT_LITERAL:
		case SimpleTypeKind.BOOLEAN_LITERAL:
			return isSimpleTypeLiteral(typeB) ? typeA.value === typeB.value : false;

		case SimpleTypeKind.ENUM_MEMBER:
			return isAssignabletoSimpleTypeInternal(typeA.type, typeB, options);

		// Primitive types
		case SimpleTypeKind.STRING:
		case SimpleTypeKind.BOOLEAN:
		case SimpleTypeKind.NUMBER:
		case SimpleTypeKind.BIG_INT:
		case SimpleTypeKind.UNDEFINED:
		case SimpleTypeKind.NULL:
			if (isSimpleTypeLiteral(typeB)) {
				return PRIMITIVE_TYPE_TO_LITERAL_MAP[typeA.kind] === typeB.kind;
			}

			return typeA.kind === typeB.kind;

		// Void
		case SimpleTypeKind.VOID:
			return typeB.kind === SimpleTypeKind.VOID;

		// Alias
		case SimpleTypeKind.ALIAS:
			return isAssignabletoSimpleTypeInternal(typeA.target, typeB, options);

		// Generic types
		case SimpleTypeKind.GENERIC_PARAMETER:
			const realType = options.genericParameterMapA.get(typeA.name);
			return isAssignabletoSimpleTypeInternal(realType || typeA.default || { kind: SimpleTypeKind.ANY }, typeB, options);

		case SimpleTypeKind.GENERIC_ARGUMENTS:
			return isAssignabletoSimpleTypeInternal(typeA.target, typeB, {
				...options,
				genericParameterMapA: extendTypeParameterMap(typeA, options.genericParameterMapA)
			});

		// Arrays
		case SimpleTypeKind.ARRAY:
			if (typeB.kind === SimpleTypeKind.ARRAY) {
				if (typeA)
				return isAssignabletoSimpleTypeInternal(typeA.type, typeB.type, options);
			}

			return false;

		// Functions
		case SimpleTypeKind.FUNCTION:
		case SimpleTypeKind.METHOD:
			if (typeB.kind !== SimpleTypeKind.FUNCTION && typeB.kind !== SimpleTypeKind.METHOD) return false;
			if (!isAssignabletoSimpleTypeInternal(typeA.returnType, typeB.returnType, options)) return false;

			for (let i = 0; i < Math.max(typeA.argTypes.length, typeB.argTypes.length); i++) {
				const argA = typeA.argTypes[i];
				const argB = typeB.argTypes[i];

				if (argB == null && argA != null && !argA.optional) {
					return false;
				}

				if (argB != null && argA == null) {
					return false;
				}

				if (!isAssignabletoSimpleTypeInternal(argA.type, argB.type, options)) {
					if (argA.spread && argA.type.kind === SimpleTypeKind.ARRAY && (!argB.spread && argB.type.kind !== SimpleTypeKind.ARRAY)) {
						if (!isAssignabletoSimpleTypeInternal(argA.type.type, argB.type, options)) {
							return false;
						}
					}
				}
			}

			return true;

		// Unions and enum members
		case SimpleTypeKind.ENUM:
		case SimpleTypeKind.UNION:
			return or(typeA.types, childTypeA => isAssignabletoSimpleTypeInternal(childTypeA, typeB, options));

		// Intersections
		case SimpleTypeKind.INTERSECTION:
			return and(typeA.types, childTypeA => isAssignabletoSimpleTypeInternal(childTypeA, typeB, options));

		// Interfaces
		case SimpleTypeKind.INTERFACE:
		case SimpleTypeKind.OBJECT:
		case SimpleTypeKind.CLASS:
			switch (typeB.kind) {
				case SimpleTypeKind.INTERFACE:
				case SimpleTypeKind.OBJECT:
				case SimpleTypeKind.CLASS:
					const membersA = typeA.kind === SimpleTypeKind.CLASS ? [...typeA.methods, ...typeA.properties] : typeA.members;
					const membersB = typeB.kind === SimpleTypeKind.CLASS ? [...typeB.methods, ...typeB.properties] : typeB.members;

					return (
						and(membersA, memberA => {
							// Make sure that every required prop in typeA is present
							const memberB = membersB.find(memberB => memberA.name === memberB.name);
							return memberB == null ? memberA.optional : true;
						}) &&
						and(membersB, memberB => {
							// Do not allow new props in subtype: contravariance
							// Strict type checking
							const memberA = membersA.find(memberA => memberA.name === memberB.name);
							if (memberA == null) return false;
							return isAssignabletoSimpleTypeInternal(memberA.type, memberB.type, options);
						})
					);
				default:
					return false;
			}

		case SimpleTypeKind.TUPLE:
			if (typeB.kind !== SimpleTypeKind.TUPLE) return false;
			return and(typeA.members, (memberA, i) => {
				const memberB = typeB.members[i];
				if (memberB == null) return memberA.optional;
				return isAssignabletoSimpleTypeInternal(memberA.type, memberB.type, options);
			});

		case SimpleTypeKind.PROMISE:
			return typeB.kind === SimpleTypeKind.PROMISE && isAssignabletoSimpleTypeInternal(typeA.type, typeB.type, options);

		//default:
		//throw new Error(`Unsupported comparison: ${typeA.kind}`);
	}
}

function extendTypeParameterMap (genericType: SimpleTypeGenericArguments, existingMap: Map<string, SimpleType>) {
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
