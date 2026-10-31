EAPI=8
PYTHON_COMPAT=( python3_{10..13} )
inherit distutils-r1
DESCRIPTION="Offline text-to-speech and audiobook video creator"
HOMEPAGE="https://example.invalid/openvoice"
SRC_URI="https://example.invalid/releases/Openmukti Audiobook Maker-${PV}-Source.tar.gz"
S="${WORKDIR}/Openmukti Audiobook Maker-${PV}-Source"
LICENSE="MIT"
SLOT="0"
KEYWORDS="~amd64 ~arm64"
RDEPEND="dev-lang/python media-video/ffmpeg app-accessibility/espeak-ng"
