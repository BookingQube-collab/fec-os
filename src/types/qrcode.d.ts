declare module "qrcode" {
  const QRCode: {
    toString(
      text: string,
      options?: { type?: "svg" | "utf8"; margin?: number; width?: number },
    ): Promise<string>;
    toDataURL(
      text: string,
      options?: { margin?: number; width?: number },
    ): Promise<string>;
  };
  export default QRCode;
}
