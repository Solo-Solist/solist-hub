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

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to open the firewall port.";
    };
  };

  config = lib.mkIf cfg.enable {
    nixpkgs.overlays = [
      (final: prev: {
        pdfcraft = final.callPackage ./package.nix { };
      })
    ];

    systemd.services.pdfcraft = {
      description = "PDFCraft PDF Tools";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];

      environment = {
        PDFCRAFT_PORT = toString cfg.port;
      };

      serviceConfig = {
        ExecStart = "${cfg.package}/bin/pdfcraft";
        Restart = "on-failure";
        DynamicUser = true;
        RuntimeDirectory = "pdfcraft";
        StateDirectory = "pdfcraft";

        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectControlGroups = true;
        RestrictSUIDSGID = true;
        MemoryDenyWriteExecute = false;
      };
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];
  };
}
