import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesWriter,
    Calldata,
    OP20,
    OP20InitParameters,
} from '@btc-vision/btc-runtime/runtime';

// ═══════════════════════════════════════════════════════════
// TestWBTC — Mintable OP20 token for OPNet testnet
// ═══════════════════════════════════════════════════════════
// Users call faucet() to mint 0.1 tWBTC per call.
// tBTC from the faucet covers gas; tWBTC is used for betting.
// ═══════════════════════════════════════════════════════════

const FAUCET_AMOUNT: u256 = u256.fromU64(10_000_000); // 0.1 tWBTC (8 decimals)
const MAX_SUPPLY: u256 = u256.fromString('2100000000000000'); // 21M tWBTC

@final
export class TestWBTC extends OP20 {
    public override onDeployment(_calldata: Calldata): void {
        this.instantiate(new OP20InitParameters(MAX_SUPPLY, 8, 'Test Wrapped BTC', 'tWBTC'));
    }

    public override onUpdate(_calldata: Calldata): void {}

    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public faucet(_: Calldata): BytesWriter {
        // _mint reverts internally if max supply would be exceeded
        this._mint(Blockchain.tx.sender, FAUCET_AMOUNT);

        const w = new BytesWriter(32);
        w.writeU256(FAUCET_AMOUNT);
        return w;
    }
}
