import type {
  HomestayBookingResponse,
  HomestayCredentialResponse,
  HomestayTurnoverResponse
} from "@jinhu/shared";
import type {
  HomestayBookingEntity,
  HomestayStayCredentialEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";

export function projectHomestayBooking(
  booking: HomestayBookingEntity,
  canReadFinance: boolean
): HomestayBookingResponse {
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    unitId: booking.unitId,
    arrivalDate: booking.arrivalDate,
    departureDate: booking.departureDate,
    status: booking.status,
    guestCount: booking.guestCount,
    sourceType: booking.sourceType,
    ...(canReadFinance
      ? {
          roomAmount: booking.roomAmount,
          adjustmentAmount: booking.adjustmentAmount,
          totalAmount: booking.totalAmount
        }
      : {})
  };
}

export function projectHomestayCredential(
  credential: HomestayStayCredentialEntity
): HomestayCredentialResponse {
  return {
    id: credential.id,
    credentialType: credential.credentialType,
    credentialLabel: credential.credentialLabel,
    credentialReference: credential.credentialReference === null ? null : "***",
    status: credential.status,
    issuedAt: credential.issuedAt.toISOString(),
    returnedAt: credential.returnedAt?.toISOString() ?? null
  };
}

export function projectHomestayTurnover(
  task: HomestayTurnoverTaskEntity,
  canReadFiles: boolean
): HomestayTurnoverResponse {
  return {
    id: task.id,
    bookingId: task.bookingId,
    unitId: task.unitId,
    status: task.status,
    assigneeId: task.assigneeId,
    assigneeName: task.assigneeName,
    ...(canReadFiles ? { photoFileIds: [...task.photoFileIds] } : {}),
    consumables: task.consumables.map((item) => ({ ...item })),
    exceptionDescription: task.exceptionDescription,
    linkedWorkOrderId: task.linkedWorkOrderId
  };
}
