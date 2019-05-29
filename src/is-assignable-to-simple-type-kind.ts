import { Type, TypeChecker } from "typescript";
import { isSimpleType, SimpleType, SimpleTypeKind } from "./simple-type";
import { toSimpleType } from "./to-simple-type";
import { isTypeChecker } from "./ts-util";
import { and, or } from "./util";
import { MasterType } from "./master-type";

export interface SimpleTypeKindComparisonOptions {
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
export function isAssignableToSimpleTypeKind(type: SimpleType, kind: SimpleTypeKind | SimpleTypeKind[], options?: SimpleTypeKindComparisonOptions): boolean;
export function isAssignableToSimpleTypeKind(type: Type, kind: SimpleTypeKind | SimpleTypeKind[], checker: TypeChecker, options?: SimpleTypeKindComparisonOptions): boolean;
export function isAssignableToSimpleTypeKind(type: Type | SimpleType, kind: SimpleTypeKind | SimpleTypeKind[], checker: TypeChecker, options?: SimpleTypeKindComparisonOptions): boolean;
export function isAssignableToSimpleTypeKind(
	type: Type | SimpleType,
	kind: SimpleTypeKind | SimpleTypeKind[],
	optionsOrChecker?: TypeChecker | SimpleTypeKindComparisonOptions,
	options: SimpleTypeKindComparisonOptions = {}
): boolean {
	if (!isSimpleType(type)) {
		return isMasterTypeAssignableToSimpleTypeKind(toSimpleType(type, optionsOrChecker as TypeChecker), kind, options);
	}
	options = (isTypeChecker(optionsOrChecker) ? options : optionsOrChecker) || {};
	return isMasterTypeAssignableToSimpleTypeKind(type, kind, options);
}

export function isMasterTypeAssignableToSimpleTypeKind(type: MasterType, kind: SimpleTypeKind | SimpleTypeKind[], options: SimpleTypeKindComparisonOptions = {}): boolean {
	const { type: actualType } = "cache" in type ? type : { type };
	// Make sure that an object without members are treated as ANY
	switch (actualType.kind) {
		case SimpleTypeKind.OBJECT:
			if (actualType.members == null || actualType.members.length === 0) {
				return isAssignableToSimpleTypeKind({ kind: SimpleTypeKind.ANY }, kind, options);
			}
			break;

		case SimpleTypeKind.ANY:
			if (options.matchAny) {
				return true;
			}
			break;
	}

	switch (actualType.kind) {
		case SimpleTypeKind.ENUM:
		case SimpleTypeKind.UNION:
			return or(actualType.types, childType => isAssignableToSimpleTypeKind(childType, kind, options));

		case SimpleTypeKind.INTERSECTION:
			return and(actualType.types, childType => isAssignableToSimpleTypeKind(childType, kind, options));

		case SimpleTypeKind.ENUM_MEMBER:
			return isAssignableToSimpleTypeKind(actualType.type, kind, options);

		case SimpleTypeKind.ALIAS:
			return isAssignableToSimpleTypeKind(actualType.target, kind, options);

		case SimpleTypeKind.GENERIC_PARAMETER:
			return isAssignableToSimpleTypeKind(actualType.default || { kind: SimpleTypeKind.ANY }, kind, options);

		default:
			if (Array.isArray(kind)) {
				return (options.op === "or" ? or : and)(kind, itemKind => actualType.kind === itemKind);
			}

			return actualType.kind === kind;
	}
}
