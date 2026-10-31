{ pkgs ? import <nixpkgs> {} }:
pkgs.python3Packages.buildPythonApplication {
  pname = "openvoice";
  version = "0.4.0";
  pyproject = true;
  src = ../..;
  build-system = with pkgs.python3Packages; [ setuptools wheel ];
  nativeBuildInputs = [ pkgs.makeWrapper ];
  postInstall = ''
    wrapProgram $out/bin/openvoice --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.ffmpeg pkgs.espeak-ng ]}
    wrapProgram $out/bin/openvoice-gui --prefix PATH : ${pkgs.lib.makeBinPath [ pkgs.ffmpeg pkgs.espeak-ng ]}
  '';
  meta = with pkgs.lib; {
    description = "Offline text-to-speech and audiobook video creator";
    license = licenses.mit;
    platforms = platforms.unix;
  };
}
