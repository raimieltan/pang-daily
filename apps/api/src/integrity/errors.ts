import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

export function rejectCommand(code: string, message: string, details: Record<string, unknown> = {}): never {
  throw new ConflictException({ ...details, code, message });
}
/** Owner-scoped misses deliberately do not reveal whether another player owns the ID. */
export function ownedResourceMissing(): never {
  throw new NotFoundException({ code: 'OWNED_RESOURCE_NOT_FOUND', message: 'This resource is not available to your player.' });
}
export function invalidContent(field: string): never {
  throw new BadRequestException({ code: 'INVALID_COMMAND_CONTENT', message: 'This command references unknown content.', fields: [{ field, message: 'Unknown content reference.' }] });
}
