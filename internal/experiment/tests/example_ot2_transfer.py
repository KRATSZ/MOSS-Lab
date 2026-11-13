"""Short OT-2 protocol for local MOSS integration tests."""

from opentrons import protocol_api

metadata = {"protocolName": "OT-2 water transfer"}
requirements = {"robotType": "OT-2", "apiLevel": "2.20"}


def run(protocol: protocol_api.ProtocolContext) -> None:
    tips = protocol.load_labware("opentrons_96_tiprack_20ul", "1")
    plate = protocol.load_labware("nest_96_wellplate_200ul_flat", "2")
    reservoir = protocol.load_labware("nest_12_reservoir_15ml", "3")
    pipette = protocol.load_instrument("p20_single_gen2", "right", tip_racks=[tips])
    water = protocol.define_liquid("Water", "Source water", "#4EA5D9")
    reservoir["A1"].load_liquid(water, 100)
    pipette.pick_up_tip()
    pipette.aspirate(10, reservoir["A1"])
    pipette.dispense(10, plate["A1"])
    pipette.drop_tip()
