import { Type, TypeChecker } from "typescript";
import { isSimpleType, SimpleType, SimpleTypeKind } from "./simple-type";
import { toSimpleType } from "./to-simple-type";
import { and, or } from "./util";

export interface AssignableToSimpleTypeKindOptions {
	op?: "and" | "or";
	matchAny?: boolean;
}

/**
 * Checks if a simple type kind is assignable to a type.
 * @param type The type to check
 * @param kind The simple type kind to check
 * @param kind The simple type kind to check
 * @param checker TypeCHecker if type is a typescript type
 * @param options Options
 */
export function isAssignableToSimpleTypeKind(type: SimpleType, kind: SimpleTypeKind | SimpleTypeKind[], options?: AssignableToSimpleTypeKindOptions): boolean;
export function isAssignableToSimpleTypeKind(type: Type, kind: SimpleTypeKind | SimpleTypeKind[], checker: TypeChecker, options?: AssignableToSimpleTypeKindOptions): boolean;
export function isAssignableToSimpleTypeKind(type: Type | SimpleType, kind: SimpleTypeKind | SimpleTypeKind[], checker: TypeChecker, options?: AssignableToSimpleTypeKindOptions): boolean;
export function isAssignableToSimpleTypeKind(
	type: Type | SimpleType,
	kind: SimpleTypeKind | SimpleTypeKind[],
	optionsOrChecker?: TypeChecker | AssignableToSimpleTypeKindOptions,
	options: AssignableToSimpleTypeKindOptions = {}
): boolean {
	if (!isSimpleType(type)) {
		return isAssignableToSimpleTypeKind(toSimpleType(type, optionsOrChecker as TypeChecker), kind, options);
	} else {
		options = optionsOrChecker as AssignableToSimpleTypeKindOptions;
	}

	switch (type.kind) {
		case SimpleTypeKind.ENUM:
		case SimpleTypeKind.UNION:
			return or(type.types, childType => isAssignableToSimpleTypeKind(childType, kind, options));

		case SimpleTypeKind.INTERSECTION:
			return and(type.types, childType => isAssignableToSimpleTypeKind(childType, kind, options));

		case SimpleTypeKind.ANY:
			return options.matchAny || false;

		case SimpleTypeKind.ENUM_MEMBER:
			return isAssignableToSimpleTypeKind(type.type, kind, options);

		case SimpleTypeKind.ALIAS:
			return isAssignableToSimpleTypeKind(type.target, kind, options);

		case SimpleTypeKind.GENERIC_PARAMETER:
			return isAssignableToSimpleTypeKind(type.default || { kind: SimpleTypeKind.ANY }, kind, options);

		default:
			if (Array.isArray(kind)) {
				return (options.op === "or" ? or : and)(kind, itemKind => type.kind === itemKind);
			}

			return type.kind === kind;
	}
}
