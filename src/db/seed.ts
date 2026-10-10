import { createItem, listItems, lookupBarcode, recordRestock } from './repositories/itemsRepo';
import type { ItemUnitInput } from './repositories/itemsRepo';

type SampleItem = {
  name: string;
  category: string;
  lowStockLevel: number;
  costPrice: number;
  sellingPrice: number;
  openingStock: number;
  units: (Omit<ItemUnitInput, 'id'> & { barcode?: string | null })[];
};

/**
 * Ten representative provision-shop products.
 * Prices are in kobo and are only meant to give a fresh install something
 * realistic to demo with. Barcodes live on the selling units.
 */
const SAMPLE_ITEMS: SampleItem[] = [
  {
    name: 'Mama Gold Rice 5kg',
    category: 'Staples',
    lowStockLevel: 4,
    costPrice: 700000,
    sellingPrice: 850000,
    openingStock: 24,
    units: [
      { unitName: 'Bag', unitsPerBase: 1, sellingPrice: 850000, isBase: true, barcode: '5012345678901' },
    ],
  },
  {
    name: 'Indomie Chicken Noodles',
    category: 'Noodles',
    lowStockLevel: 80,
    costPrice: 35000,
    sellingPrice: 45000,
    openingStock: 400,
    units: [
      { unitName: 'Carton', unitsPerBase: 40, sellingPrice: 1550000, isBase: false, barcode: '5012345678911' },
      { unitName: 'Pack', unitsPerBase: 1, sellingPrice: 45000, isBase: true, barcode: '5012345678902' },
    ],
  },
  {
    name: 'Kings Vegetable Oil 1L',
    category: 'Cooking Oil',
    lowStockLevel: 12,
    costPrice: 180000,
    sellingPrice: 220000,
    openingStock: 60,
    units: [
      { unitName: 'Carton', unitsPerBase: 4, sellingPrice: 860000, isBase: false },
      { unitName: 'Bottle', unitsPerBase: 1, sellingPrice: 220000, isBase: true, barcode: '5012345678903' },
    ],
  },
  {
    name: 'Bua Sugar 1kg',
    category: 'Staples',
    lowStockLevel: 24,
    costPrice: 150000,
    sellingPrice: 200000,
    openingStock: 150,
    units: [
      { unitName: 'Carton', unitsPerBase: 12, sellingPrice: 2200000, isBase: false },
      { unitName: 'Bag', unitsPerBase: 1, sellingPrice: 200000, isBase: true, barcode: '5012345678904' },
    ],
  },
  {
    name: 'Bobo Salt 500g',
    category: 'Staples',
    lowStockLevel: 20,
    costPrice: 40000,
    sellingPrice: 60000,
    openingStock: 80,
    units: [
      { unitName: 'Sachet', unitsPerBase: 1, sellingPrice: 60000, isBase: true, barcode: '5012345678905' },
    ],
  },
  {
    name: 'Peak Milk Sachet',
    category: 'Dairy',
    lowStockLevel: 60,
    costPrice: 95000,
    sellingPrice: 120000,
    openingStock: 300,
    units: [
      { unitName: 'Carton', unitsPerBase: 20, sellingPrice: 2300000, isBase: false },
      { unitName: 'Sachet', unitsPerBase: 1, sellingPrice: 120000, isBase: true, barcode: '5012345678906' },
    ],
  },
  {
    name: 'Heinz Baked Beans 400g',
    category: 'Staples',
    lowStockLevel: 10,
    costPrice: 120000,
    sellingPrice: 150000,
    openingStock: 45,
    units: [
      { unitName: 'Can', unitsPerBase: 1, sellingPrice: 150000, isBase: true, barcode: '5012345678907' },
    ],
  },
  {
    name: 'Omo Detergent 500g',
    category: 'Household',
    lowStockLevel: 24,
    costPrice: 130000,
    sellingPrice: 170000,
    openingStock: 70,
    units: [
      { unitName: 'Carton', unitsPerBase: 12, sellingPrice: 1900000, isBase: false },
      { unitName: 'Pack', unitsPerBase: 1, sellingPrice: 170000, isBase: true, barcode: '5012345678908' },
    ],
  },
  {
    name: 'Palm Oil 1L',
    category: 'Cooking Oil',
    lowStockLevel: 10,
    costPrice: 140000,
    sellingPrice: 190000,
    openingStock: 40,
    units: [{ unitName: 'Bottle', unitsPerBase: 1, sellingPrice: 190000, isBase: true, barcode: '5012345678909' }],
  },
  {
    name: 'Cleanmaxx Toilet Roll (4 Pack)',
    category: 'Household',
    lowStockLevel: 8,
    costPrice: 150000,
    sellingPrice: 200000,
    openingStock: 36,
    units: [{ unitName: 'Pack', unitsPerBase: 1, sellingPrice: 200000, isBase: true, barcode: '5012345678910' }],
  },
];

export const SAMPLE_ITEM_COUNT = SAMPLE_ITEMS.length;

/** Returns how many items were actually created (duplicates are skipped). */
export async function loadSampleData(): Promise<number> {
  const existing = await listItems();
  const names = new Set(existing.map((item) => item.name.toLowerCase()));

  let created = 0;
  for (const sample of SAMPLE_ITEMS) {
    if (names.has(sample.name.toLowerCase())) continue;

    const barcodes = sample.units
      .map((unit) => unit.barcode?.trim().toLowerCase())
      .filter((code): code is string => Boolean(code));
    let used = false;
    for (const barcode of barcodes) {
      if ((await lookupBarcode(barcode)) != null) {
        used = true;
        break;
      }
    }
    if (used) continue;

    const item = await createItem({
      name: sample.name,
      category: sample.category,
      tracksStock: true,
      lowStockLevel: sample.lowStockLevel,
      costPrice: sample.costPrice,
      sellingPrice: sample.sellingPrice,
      units: sample.units,
    });

    if (sample.openingStock > 0) {
      await recordRestock({
        itemId: item.id,
        quantityBase: sample.openingStock,
        unitCost: sample.costPrice,
        note: 'Opening stock (sample data)',
      });
    }

    names.add(sample.name.toLowerCase());
    created += 1;
  }

  return created;
}