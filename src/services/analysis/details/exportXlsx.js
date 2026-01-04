// src/services/analysis/details/exportXlsx.js

import ExcelJS from "exceljs";

export async function exportDetailsToXlsx({ type, portalId, items }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Detalle");

  sheet.columns = [
    { header: "Nombre", key: "name", width: 30 },
    { header: "Email", key: "email", width: 30 },
    { header: "URL HubSpot", key: "hubspotUrl", width: 50 }
  ];

  items.forEach(item => {
    sheet.addRow({
      name: item.name || "",
      email: item.email || "",
      hubspotUrl: item.hubspotUrl || ""
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return {
    buffer,
    filename: `${type}-${portalId}.xlsx`
  };
}
