import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { BusinessService } from "./business.service";
import { CompletePaymentDto, CreateOrderDto, CreatePaymentDto, CreateRefundDto, RetryExceptionDto } from "./business.dto";

@ApiTags("commercial-loop")
@Controller()
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Get("demo/bootstrap")
  bootstrap(): Promise<unknown> { return this.business.bootstrap(); }

  @Post("demo/reset")
  reset(): Promise<unknown> { return this.business.reset(); }

  @Post("orders")
  createOrder(@Body() dto: CreateOrderDto): Promise<unknown> { return this.business.createOrder(dto); }

  @Get("orders")
  listOrders(): Promise<unknown> { return this.business.listOrders(); }

  @Get("orders/:orderId")
  orderDetail(@Param("orderId") orderId: string): Promise<unknown> { return this.business.orderDetail(orderId); }

  @Post("orders/:orderId/payment-attempts")
  createPayment(@Param("orderId") orderId: string, @Body() dto: CreatePaymentDto): Promise<unknown> {
    return this.business.createPayment(orderId, dto);
  }

  @Post("payment-attempts/:paymentAttemptId/mock-complete")
  completePayment(@Param("paymentAttemptId") paymentAttemptId: string, @Body() dto: CompletePaymentDto): Promise<unknown> {
    return this.business.completePayment(paymentAttemptId, dto);
  }

  @Post("orders/:orderId/refunds")
  refund(@Param("orderId") orderId: string, @Body() dto: CreateRefundDto): Promise<unknown> {
    return this.business.createRefund(orderId, dto);
  }

  @Get("exceptions")
  exceptions(): Promise<unknown> { return this.business.exceptions(); }

  @Post("exceptions/:exceptionId/retry")
  retry(@Param("exceptionId") exceptionId: string, @Body() dto: RetryExceptionDto): Promise<unknown> {
    return this.business.retryException(exceptionId, dto.reason);
  }

  @Get("dashboard")
  dashboard(): Promise<unknown> { return this.business.dashboard(); }
}

