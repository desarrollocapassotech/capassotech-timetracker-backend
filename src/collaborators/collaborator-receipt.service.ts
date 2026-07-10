import { BadRequestException, Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { GenerateCollaboratorReceiptDto } from './collaborator-receipt.dto';

// Mismo criterio que firebase-admin.provider.ts para ubicar archivos locales:
// relativo a process.cwd() (raíz del repo), no a __dirname, para que funcione
// igual en dev (ts-node) y en prod (dist/).
const TEMPLATE_PATH = join(
  process.cwd(),
  'templates',
  'template-recibo-colaborador.pdf',
);

const MAX_ITEMS = 6;

// El template tiene 6 filas fijas (Descripción/Cantidad/Monto); estos nombres de
// campo vienen del PDF original (templates/template-recibo-colaborador.pdf) y se
// obtuvieron inspeccionando el AcroForm con pdf-lib -> no tienen un patrón
// numérico consistente porque así quedaron al exportar el diseño.
const ROW_FIELDS: Array<{
  description: string;
  quantity: string;
  amount: string;
}> = [
  { description: 'Text2', quantity: 'Text8', amount: 'Text14' },
  { description: 'Text3', quantity: 'Text9', amount: 'Text15' },
  { description: 'Text4', quantity: 'Text10', amount: 'Text16' },
  { description: 'Text5', quantity: 'Text11', amount: 'Text17' },
  { description: 'Text6', quantity: 'Text12', amount: 'Text18' },
  { description: 'Text7', quantity: 'Text13', amount: 'Text19' },
];
const TOTAL_FIELD = 'Text20';

// Centro de la columna "MONTO" (obtenido de la posición del texto del header en
// el template) y línea de base para el subtítulo de moneda que va justo debajo.
const MONTO_HEADER_CENTER_X = 504;
const CURRENCY_LABEL_Y = 508;
const CURRENCY_LABEL_SIZE = 7;

@Injectable()
export class CollaboratorReceiptService {
  async generate(dto: GenerateCollaboratorReceiptDto): Promise<Buffer> {
    if (!dto.fullName?.trim()) {
      throw new BadRequestException(
        'Falta el nombre y apellido del colaborador.',
      );
    }
    if (!dto.items?.length) {
      throw new BadRequestException(
        'El recibo necesita al menos un concepto cargado.',
      );
    }
    if (dto.items.length > MAX_ITEMS) {
      throw new BadRequestException(
        `El recibo admite como máximo ${MAX_ITEMS} conceptos.`,
      );
    }

    const templateBytes = await readFile(TEMPLATE_PATH);
    const pdfDoc = await PDFDocument.load(templateBytes);

    // El template original (exportado de Canva) trae metadata del diseño
    // ("Factura Negocio Minimalista Rosa", autor personal, etc.) que no
    // corresponde mostrar en un recibo emitido por la empresa.
    pdfDoc.setTitle(`Recibo - ${dto.fullName.trim()}`);
    pdfDoc.setAuthor('Capasso Tech');
    pdfDoc.setSubject('Recibo de pago');
    pdfDoc.setKeywords([]);
    pdfDoc.setCreator('Capasso Tech');
    pdfDoc.setProducer('Capasso Tech');

    const form = pdfDoc.getForm();

    const setText = (fieldName: string, value: string | undefined) => {
      form.getTextField(fieldName).setText(value?.trim() || '');
    };

    setText('Fecha', dto.date);
    setText('Nombre y apellido', dto.fullName);
    setText('Mes y año', dto.monthYear);
    setText('Metodo de pago', dto.paymentMethod);

    dto.items.forEach((item, index) => {
      const row = ROW_FIELDS[index];
      setText(row.description, item.description);
      setText(row.quantity, item.quantity);
      setText(row.amount, item.amount);
    });

    setText(TOTAL_FIELD, dto.total);

    // Los montos ya no llevan "ARS"/"USD" en cada celda (solo el símbolo "$"),
    // así que la moneda se imprime una única vez como subtítulo bajo el header
    // "MONTO", centrada sobre esa columna.
    const currencyLabel = dto.currency?.trim().toUpperCase();
    if (currencyLabel) {
      const page = pdfDoc.getPage(0);
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const textWidth = font.widthOfTextAtSize(
        currencyLabel,
        CURRENCY_LABEL_SIZE,
      );
      page.drawText(currencyLabel, {
        x: MONTO_HEADER_CENTER_X - textWidth / 2,
        y: CURRENCY_LABEL_Y,
        size: CURRENCY_LABEL_SIZE,
        font,
        color: rgb(0, 0, 0),
      });
    }

    // Recibo final: se aplana para que no quede editable en el PDF entregado.
    form.flatten();

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }
}
