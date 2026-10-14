// Injection tokens: use cases depend on tokens, never on concrete adapters (standards §2).
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
export const RISK_ASSESSMENT = Symbol('RISK_ASSESSMENT');
export const CLOCK = Symbol('CLOCK');
export const ID_GENERATOR = Symbol('ID_GENERATOR');

export const CREATE_ORDER_USE_CASE = Symbol('CREATE_ORDER_USE_CASE');
export const GET_ORDER_USE_CASE = Symbol('GET_ORDER_USE_CASE');
export const MARK_ORDER_PAID_USE_CASE = Symbol('MARK_ORDER_PAID_USE_CASE');
