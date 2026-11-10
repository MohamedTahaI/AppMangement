import type { ReportData, ReportStatus } from './reportData';

function statusLabel(status: ReportStatus): string {
  return status === 'دفع' ? 'مدفوع' : status;
}

export function buildSheetRows(report: ReportData) {
  const allApartments = report.activeApartments;
  return {
    schemaVersion: 2,
    summary: {
      buildingName: report.buildingName,
      generatedAt: report.generatedAt,
      collectedFromPayments: report.summary.collected,
      specialCollectionsCollected: report.summary.specialCollected,
      netAdjustments: report.summary.adjustments,
      totalCollected: report.summary.collected + report.summary.adjustments,
      totalExpenses: report.summary.totalExpenses,
      balance: report.summary.balance,
      paidApartments: report.summary.paidApartments,
      totalApartments: report.summary.totalApartments,
    },
    monthlySummary: report.monthlySummary,
    monthlyMatrix: report.monthlyMatrix.map((year) => ({
      year: year.year,
      apartments: year.apartments.map((apartment) => ({
        ...apartment,
        months: Object.fromEntries(
          Object.entries(apartment.months).map(([month, value]) => [
            month,
            { ...value, status: statusLabel(value.status) },
          ]),
        ),
      })),
    })),
    apartmentStatus: report.apartments.map((apartment) => ({
      number: apartment.apartmentNumber,
      ownerName: apartment.ownerName,
      due: apartment.due,
      paid: apartment.paid,
      remaining: apartment.remaining,
      status: statusLabel(apartment.status),
      monthsPaid: apartment.monthsPaid.join('، '),
    })),
    specialCollections: report.specialCollections.map((collection) => ({
      id: collection.id,
      title: collection.title,
      date: collection.date,
      amountPerApartment: collection.amountPerApartment,
      apartments: collection.apartments.map((apartment) => ({
        number: apartment.apartmentNumber,
        ownerName: apartment.ownerName,
        due: apartment.due,
        paid: apartment.paid,
        remaining: apartment.remaining,
        status: statusLabel(apartment.status),
      })),
    })),
    expenses: report.expenses,
    expensesByCategory: report.expensesByCategory,
    payments: report.payments,
    adjustments: report.adjustments,
    unpaid: report.unpaid.map((row) => ({
      ...row,
      monthsUnpaid: row.monthsUnpaid.join('، '),
    })),
    apartments: allApartments,
  };
}
