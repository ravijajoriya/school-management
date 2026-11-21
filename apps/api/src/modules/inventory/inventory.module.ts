import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AUDIT_ACTIONS,
  PERMISSIONS,
  listInventoryQuerySchema,
  saveInventoryCategorySchema,
  saveInventoryItemSchema,
  uuidSchema,
  type InventoryCategoryItem,
  type InventoryItemRow,
  type ItemCondition,
  type ListInventoryQuery,
  type Paginated,
  type SaveInventoryItemData,
} from '@school/shared';
import type { Request } from 'express';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { CurrentUser, RequirePermissions } from '../../common/decorators/access.decorators.js';
import { getRequestContext, type RequestContext } from '../../common/http/request-context.js';
import type { RequestUser } from '../../common/http/request-user.js';
import { dayToDate, isoDayOrNull, paginated } from '../../common/utils/content.js';
import { paiseToDb, rupees, toPaise } from '../../common/utils/money.js';
import { AuditService } from '../audit/audit.service.js';

type CategoryInput = z.output<typeof saveInventoryCategorySchema>;
const itemInclude = {
  category: { select: { id: true, name: true } },
} satisfies Prisma.InventoryItemInclude;
type ItemRow = Prisma.InventoryItemGetPayload<{ include: typeof itemInclude }>;

function toItem(i: ItemRow): InventoryItemRow {
  return {
    id: i.id,
    category: i.category,
    assetCode: i.assetCode,
    name: i.name,
    quantity: Number(i.quantity.toString()),
    unit: i.unit,
    location: i.location,
    conditionStatus: i.conditionStatus as ItemCondition,
    purchaseDate: isoDayOrNull(i.purchaseDate),
    purchaseCost: i.purchaseCost === null ? null : rupees(toPaise(i.purchaseCost)),
    notes: i.notes,
  };
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async categories(): Promise<InventoryCategoryItem[]> {
    const rows = await this.prisma.inventoryCategory.findMany({
      include: { _count: { select: { items: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      items: c._count.items,
    }));
  }

  async saveCategory(
    id: string | null,
    input: CategoryInput,
    actor: RequestUser,
    context: RequestContext,
  ) {
    const data = { name: input.name, description: input.description ?? null };
    const row = await this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.inventoryCategory.findUnique({ where: { id } }) : null;
      if (id && !before) throw new NotFoundException('Category not found');
      const saved = id
        ? await tx.inventoryCategory.update({ where: { id }, data })
        : await tx.inventoryCategory.create({ data });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.INVENTORY_CATEGORY_SAVED,
          entityType: 'inventory_category',
          entityId: saved.id,
          userId: actor.id,
          before,
          after: saved,
          context,
        },
        tx,
      );
      return saved;
    });
    return (await this.categories()).find((c) => c.id === row.id)!;
  }

  async list(q: ListInventoryQuery): Promise<Paginated<InventoryItemRow>> {
    const where: Prisma.InventoryItemWhereInput = {
      categoryId: q.categoryId,
      conditionStatus: q.conditionStatus,
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { assetCode: { contains: q.search, mode: 'insensitive' } },
              { location: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        include: itemInclude,
        orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);
    return paginated(rows.map(toItem), total, q.page, q.pageSize);
  }

  /** Register summary: items, quantity and purchase value per category, and counts per condition. */
  async summary() {
    const [cats, byCondition] = await Promise.all([
      this.prisma.inventoryCategory.findMany({
        include: {
          items: { select: { quantity: true, purchaseCost: true, conditionStatus: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.inventoryItem.groupBy({ by: ['conditionStatus'], _count: { _all: true } }),
    ]);
    const categories = cats.map((c) => {
      const active = c.items.filter((i) => i.conditionStatus !== 'DISPOSED');
      return {
        id: c.id,
        name: c.name,
        items: active.length,
        quantity: active.reduce((n, i) => n + Number(i.quantity.toString()), 0),
        value: rupees(active.reduce((n, i) => n + toPaise(i.purchaseCost), 0)),
        needsAttention: active.filter(
          (i) => i.conditionStatus === 'NEEDS_REPAIR' || i.conditionStatus === 'DAMAGED',
        ).length,
      };
    });
    return {
      categories,
      byCondition: Object.fromEntries(byCondition.map((r) => [r.conditionStatus, r._count._all])),
      totalValue: categories.reduce((n, c) => n + c.value, 0),
    };
  }

  async get(id: string) {
    const row = await this.prisma.inventoryItem.findUnique({ where: { id }, include: itemInclude });
    if (!row) throw new NotFoundException('Item not found');
    return toItem(row);
  }

  private data(input: SaveInventoryItemData) {
    return {
      categoryId: input.categoryId,
      name: input.name,
      quantity: input.quantity.toString(),
      unit: input.unit ?? null,
      location: input.location ?? null,
      conditionStatus: input.conditionStatus,
      purchaseDate: input.purchaseDate ? dayToDate(input.purchaseDate) : null,
      purchaseCost:
        input.purchaseCost === undefined ? null : paiseToDb(Math.round(input.purchaseCost * 100)),
      notes: input.notes ?? null,
    };
  }

  private async checkCategory(categoryId: string) {
    if (!(await this.prisma.inventoryCategory.findUnique({ where: { id: categoryId } })))
      throw new BadRequestException(['categoryId: Category not found']);
  }

  async create(input: SaveInventoryItemData, actor: RequestUser, context: RequestContext) {
    await this.checkCategory(input.categoryId);
    const row = await this.prisma.$transaction(async (tx) => {
      let assetCode = input.assetCode;
      if (!assetCode) {
        const [{ n }] = await tx.$queryRaw<
          { n: bigint }[]
        >`SELECT nextval('inventory_asset_code_seq') AS n`;
        assetCode = `AST-${n.toString().padStart(5, '0')}`;
      }
      const saved = await tx.inventoryItem.create({
        data: { ...this.data(input), assetCode },
        include: itemInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.INVENTORY_ITEM_CREATED,
          entityType: 'inventory_item',
          entityId: saved.id,
          userId: actor.id,
          after: toItem(saved),
          context,
        },
        tx,
      );
      return saved;
    });
    return toItem(row);
  }

  async update(
    id: string,
    input: SaveInventoryItemData,
    actor: RequestUser,
    context: RequestContext,
  ) {
    await this.checkCategory(input.categoryId);
    const before = await this.get(id);
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.inventoryItem.update({
        where: { id },
        data: { ...this.data(input), assetCode: input.assetCode ?? before.assetCode },
        include: itemInclude,
      });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.INVENTORY_ITEM_UPDATED,
          entityType: 'inventory_item',
          entityId: id,
          userId: actor.id,
          before,
          after: toItem(saved),
          context,
        },
        tx,
      );
      return saved;
    });
    return toItem(row);
  }

  /** For entries made by mistake. Real disposals are recorded with condition "Disposed". */
  async remove(id: string, actor: RequestUser, context: RequestContext) {
    const before = await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.INVENTORY_ITEM_DELETED,
          entityType: 'inventory_item',
          entityId: id,
          userId: actor.id,
          before,
          context,
        },
        tx,
      );
    });
  }

  async removeCategory(id: string, actor: RequestUser, context: RequestContext) {
    const cat = await this.prisma.inventoryCategory.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!cat) throw new NotFoundException('Category not found');
    if (cat._count.items)
      throw new ConflictException('Move or delete the items in this category first');
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryCategory.delete({ where: { id } });
      await this.audit.log(
        {
          action: AUDIT_ACTIONS.INVENTORY_CATEGORY_SAVED,
          entityType: 'inventory_category',
          entityId: id,
          userId: actor.id,
          before: cat,
          after: null,
          reason: 'deleted',
          context,
        },
        tx,
      );
    });
  }
}

const id = () => Param('id', { schema: uuidSchema });

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('categories')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  categories() {
    return this.inventory.categories();
  }

  @Post('categories')
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  createCategory(
    @Body({ schema: saveInventoryCategorySchema }) body: CategoryInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.inventory.saveCategory(null, body, user, getRequestContext(req));
  }

  @Patch('categories/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  updateCategory(
    @id() categoryId: string,
    @Body({ schema: saveInventoryCategorySchema }) body: CategoryInput,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.inventory.saveCategory(categoryId, body, user, getRequestContext(req));
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  async removeCategory(
    @id() categoryId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.inventory.removeCategory(categoryId, user, getRequestContext(req));
  }

  @Get('summary')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  summary() {
    return this.inventory.summary();
  }

  @Get('items')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  list(@Query({ schema: listInventoryQuerySchema }) q: ListInventoryQuery) {
    return this.inventory.list(q);
  }

  @Get('items/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_READ)
  get(@id() itemId: string) {
    return this.inventory.get(itemId);
  }

  @Post('items')
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  create(
    @Body({ schema: saveInventoryItemSchema }) body: SaveInventoryItemData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.inventory.create(body, user, getRequestContext(req));
  }

  @Patch('items/:id')
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  update(
    @id() itemId: string,
    @Body({ schema: saveInventoryItemSchema }) body: SaveInventoryItemData,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.inventory.update(itemId, body, user, getRequestContext(req));
  }

  @Delete('items/:id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.INVENTORY_MANAGE)
  async remove(@id() itemId: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    await this.inventory.remove(itemId, user, getRequestContext(req));
  }
}

@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
