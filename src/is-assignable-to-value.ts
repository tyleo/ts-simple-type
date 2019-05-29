import { Type, TypeChecker } from "typescript";
import { isSimpleType, SimpleType, SimpleTypeKind } from "./simple-type";
import { toSimpleType } from "./to-simple-type";
import { MasterType } from "./master-type";
import { isAssignableToSimpleTypeWithCache } from "./is-assignable-to-simple-type";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests if a type is assignable to a value.
 * Tests "type = value" in strict mode.
 * @param type The type to test.
 * @param value The value to test.
 */
export function isAssignableToValue(type: SimpleType, value: any): boolean;
export function isAssignableToValue(type: Type, value: any, checker: TypeChecker): boolean;
export function isAssignableToValue(type: SimpleType | Type, value: any, checker: TypeChecker): boolean;
export function isAssignableToValue(type: SimpleType | Type, value: any, checker?: TypeChecker): boolean {
	if (isSimpleType(type)) {
		return isMasterTypeAssignableToValue(type, value);
	}

	return isMasterTypeAssignableToValue(toSimpleType(type, checker as TypeChecker), value);
}

export function isMasterTypeAssignableToValue(type: MasterType, value: any): boolean {
	const { type: actualType, cache } = "cache" in type ? type : { type: type, cache: [] };
	if (typeof value === "string") {
		return isAssignableToSimpleTypeWithCache(
			actualType,
			cache,
			{
				kind: SimpleTypeKind.STRING_LITERAL,
				value
			},
			[],
			{ strict: true }
		);
	} else if (typeof value === "number") {
		return isAssignableToSimpleTypeWithCache(
			actualType,
			cache,
			{
				kind: SimpleTypeKind.NUMBER_LITERAL,
				value
			},
			[],
			{ strict: true }
		);
	} else if (typeof value === "boolean") {
		return isAssignableToSimpleTypeWithCache(
			actualType,
			cache,
			{
				kind: SimpleTypeKind.BOOLEAN_LITERAL,
				value
			},
			[],
			{ strict: true }
		);
	} else if (value instanceof Promise) {
		return isAssignableToSimpleTypeWithCache(
			actualType,
			cache,
			{
				kind: SimpleTypeKind.PROMISE,
				type: { kind: SimpleTypeKind.ANY }
			},
			[],
			{ strict: true }
		);
	} else if (value instanceof Date) {
		return isAssignableToSimpleTypeWithCache(
			actualType,
			cache,
			{
				kind: SimpleTypeKind.DATE
			},
			[],
			{ strict: true }
		);
	}

	throw new Error(`Comparing type "${actualType.kind}" to value ${value}, type ${typeof value} not supported yet.`);
}
