import React, { useState } from "react";

import { Modal, ModalFooter, ModalBody, Button } from "reactstrap";

const ReviewModal = (props) => {
    const [inputValues, setInputValues] = useState({
        content: "",
    });

    const handleOnChange = (event) => {
        const { name, value } = event.target;
        setInputValues({ ...inputValues, [name]: value });
    };
    let handleCloseModal = () => {
        props.closeModal();
        setInputValues({ ...inputValues, ["content"]: "" });
    };
    let handleSaveInfor = () => {
        setInputValues({ ...inputValues, ["content"]: "" });
        props.sendDataFromReViewModal(inputValues.content);
    };
    return (
        <div className="">
            <Modal
                isOpen={props.isOpenModal}
                className={"booking-modal-container"}
                size="md"
                centered
            >
                <div className="modal-header">
                    <h5 className="modal-title">
                        Viết phản hồi đánh giá sản phẩm
                    </h5>
                    <button
                        onClick={handleCloseModal}
                        type="button"
                        className="btn btn-time"
                        aria-label="Close"
                    >
                        X
                    </button>
                </div>
                <ModalBody>
                    <div className="row">
                        <div className="col-12 form-group">
                            <label>Phản hồi</label>
                            <textarea
                                name="content"
                                value={inputValues.content}
                                onChange={(event) => handleOnChange(event)}
                                className="form-control"
                            ></textarea>
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button color="primary" onClick={handleSaveInfor}>
                        Lưu thông tin
                    </Button>{" "}
                    <Button onClick={handleCloseModal}>Hủy</Button>
                </ModalFooter>
            </Modal>
        </div>
    );
};
export default ReviewModal;
