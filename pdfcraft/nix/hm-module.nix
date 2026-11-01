{ config, lib, pkgs, ... }:

let
  cfg = config.services.pdfcraft;
in
{
  options.services.pdfcraft = {
    enable = lib.mkEnableOption "PDFCraft - Professional PDF Tools";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.pdfcraft;
      defaultText = lib.literalExpression "pkgs.pdfcraft";
      description = "The PDFCraft package to use.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Port to listen on.";
    };
  };

  config = lib.mkIf cfg.enable {
    nixpkgs.overlays = [
      (final: prev: {
        pdfcraft = final.callPackage ./package.nix { };
      })
    ];

    systemd.user.services.pdfcraft = {
      Unit = {
        Description = "PDFCraft PDF Tools";
        After = [ "network.target" ];
      };

      Service = {
        ExecStart = "${cfg.package}/bin/pdfcraft";
        Restart = "on-failure";
        Environment = [
          "PDFCRAFT_PORT=${toString cfg.port}"
        ];
      };

      Install = {
        WantedBy = [ "default.target" ];
      };
    };
  };
}
