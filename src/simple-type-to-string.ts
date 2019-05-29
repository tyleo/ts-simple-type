import { SimpleType, SimpleTypeFunctionArgument, SimpleTypeKind } from "./simple-type";

/**
 * Converts a simple type to a string.
 * @param type Simple Type
 */
export function simpleTypeToString(type: SimpleType): string {
	return simpleTypeToStringWithCache(type, []);
}

export function simpleTypeToStringWithCache(type: SimpleType, cache: SimpleType[]): string {
	//}, options: SimpleTypeToStringOptions): string {
	switch (type.kind) {
		case SimpleTypeKind.FLAT_TYPE_REF:
			return cache[type.ref].name || "[Circular]";
		case SimpleTypeKind.BOOLEAN_LITERAL:
			return String(type.value);
		case SimpleTypeKind.NUMBER_LITERAL:
			return String(type.value);
		case SimpleTypeKind.STRING_LITERAL:
			return `"${type.value}"`;
		case SimpleTypeKind.BIG_INT_LITERAL:
			return `${type.value}n`;
		case SimpleTypeKind.STRING:
			return "string";
		case SimpleTypeKind.BOOLEAN:
			return "boolean";
		case SimpleTypeKind.NUMBER:
			return "number";
		case SimpleTypeKind.BIG_INT:
			return "bigint";
		case SimpleTypeKind.UNDEFINED:
			return "undefined";
		case SimpleTypeKind.NULL:
			return "null";
		case SimpleTypeKind.ANY:
			return "any";
		case SimpleTypeKind.UNKNOWN:
			return "unknown";
		case SimpleTypeKind.VOID:
			return "void";
		case SimpleTypeKind.NEVER:
			return "never";
		case SimpleTypeKind.FUNCTION:
		case SimpleTypeKind.METHOD: {
			if (type.kind === SimpleTypeKind.FUNCTION && type.name != null) return type.name;
			const argText = functionArgTypesToString(type.argTypes || [], cache);
			return `${type.typeParameters != null ? `<${type.typeParameters.map(tp => tp.name).join(",")}>` : ""}(${argText})${
				type.returnType != null ? ` => ${simpleTypeToStringWithCache(type.returnType, cache)}` : ""
			}`;
		}
		case SimpleTypeKind.ARRAY: {
			const hasMultipleTypes = [SimpleTypeKind.UNION, SimpleTypeKind.INTERSECTION].includes(type.type.kind);
			let memberType = simpleTypeToStringWithCache(type.type, cache);
			if (type.name != null && ["ArrayLike", "ReadonlyArray"].includes(type.name)) return `${type.name}<${memberType}>`;
			if (hasMultipleTypes && type.type.name == null) memberType = `(${memberType})`;
			return `${memberType}[]`;
		}
		case SimpleTypeKind.UNION: {
			if (type.name != null) return type.name;
			return type.types.map(i => simpleTypeToStringWithCache(i, cache)).join(" | ");
		}
		case SimpleTypeKind.ENUM:
			return type.name;
		case SimpleTypeKind.ENUM_MEMBER:
			return type.fullName;
		case SimpleTypeKind.INTERSECTION:
			if (type.name != null) return type.name;
			return type.types.map(i => simpleTypeToStringWithCache(i, cache)).join(" & ");
		case SimpleTypeKind.INTERFACE:
			if (type.name != null) return type.name;
		// this fallthrough is intentional
		case SimpleTypeKind.OBJECT: {
			if (type.members == null || type.members.length === 0) return "{}";
			return `{ ${type.members
				.map(member => {
					// this check needs to change in the future
					if (member.type.kind === SimpleTypeKind.FUNCTION || member.type.kind === SimpleTypeKind.METHOD) {
						const result = simpleTypeToStringWithCache(member.type, cache);
						return `${member.name}${result.replace(" => ", ": ")}`;
					}

					return `${member.name}: ${simpleTypeToStringWithCache(member.type, cache)}`;
				})
				.join("; ")}${type.members.length > 0 ? ";" : ""} }`;
		}
		case SimpleTypeKind.TUPLE:
			return `[${type.members.map(member => `${simpleTypeToStringWithCache(member.type, cache)}${member.optional ? "?" : ""}`).join(", ")}]`;
		case SimpleTypeKind.GENERIC_ARGUMENTS: {
			const { target, typeArguments } = type;
			return typeArguments.length === 0 ? target.name || "" : `${target.name}<${typeArguments.map(i => simpleTypeToStringWithCache(i, cache)).join(", ")}>`;
		}
		case SimpleTypeKind.PROMISE:
			return `${type.name || "Promise"}<${simpleTypeToStringWithCache(type.type, cache)}>`;
		case SimpleTypeKind.DATE:
			return "Date";
		default:
			return type.name || "";
	}
}

function functionArgTypesToString(argTypes: SimpleTypeFunctionArgument[], cache: SimpleType[]): string {
	return argTypes
		.map(arg => {
			return `${arg.spread ? "..." : ""}${arg.name}${arg.optional ? "?" : ""}: ${simpleTypeToStringWithCache(arg.type, cache)}`;
		})
		.join(", ");
}
