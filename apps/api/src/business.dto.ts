import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateOrderDto {
  @IsString()
  userId!: string;

  @IsString()
  skuId!: string;

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}

export class CreatePaymentDto {
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  method?: string;
}

export class CompletePaymentDto {
  @IsIn(["SUCCESS", "FAILURE", "DELAYED", "ENTITLEMENT_FAILURE", "AMOUNT_MISMATCH"])
  outcome!: "SUCCESS" | "FAILURE" | "DELAYED" | "ENTITLEMENT_FAILURE" | "AMOUNT_MISMATCH";

  @IsOptional()
  @IsString()
  providerEventId?: string;
}

export class RetryExceptionDto {
  @IsString()
  @MinLength(2)
  reason!: string;
}

export class CreateRefundDto {
  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @IsString()
  @MinLength(2)
  reason!: string;
}

